from __future__ import annotations

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.time import utcnow
from app.models import Folder

ROOT_ID = 1


async def get(db: AsyncSession, folder_id: int, include_deleted: bool = False) -> Folder:
    f = await db.get(Folder, folder_id)
    if not f or (not include_deleted and f.deleted_at is not None):
        raise NotFound("Folder not found")
    return f


async def get_root(db: AsyncSession) -> Folder:
    return await get(db, ROOT_ID)


async def list_children(db: AsyncSession, parent_id: int) -> list[Folder]:
    res = await db.execute(
        select(Folder)
        .where(and_(Folder.parent_id == parent_id, Folder.deleted_at.is_(None)))
        .order_by(func.lower(Folder.name))
    )
    return list(res.scalars())


async def create(db: AsyncSession, parent_id: int, name: str, user_id: int) -> Folder:
    parent = await get(db, parent_id)
    # depth check
    depth = 0
    cursor = parent
    while cursor.parent_id is not None:
        depth += 1
        cursor = await db.get(Folder, cursor.parent_id)
    if depth + 1 > 32:
        raise Conflict("Maximum folder depth exceeded")
    # uniqueness pre-check (DB also enforces partial unique)
    existing = await db.execute(
        select(Folder.id).where(
            and_(
                Folder.parent_id == parent_id,
                func.lower(Folder.name) == name.lower(),
                Folder.deleted_at.is_(None),
            )
        )
    )
    if existing.first():
        raise Conflict("A folder with this name already exists here")
    f = Folder(parent_id=parent_id, name=name, created_by=user_id)
    db.add(f)
    await db.flush()
    return f


async def rename(db: AsyncSession, folder: Folder, new_name: str) -> None:
    dup = await db.execute(
        select(Folder.id).where(
            and_(
                Folder.parent_id == folder.parent_id,
                func.lower(Folder.name) == new_name.lower(),
                Folder.deleted_at.is_(None),
                Folder.id != folder.id,
            )
        )
    )
    if dup.first():
        raise Conflict("Name already taken in this folder")
    folder.name = new_name


async def move(db: AsyncSession, folder: Folder, new_parent_id: int) -> None:
    if folder.id == 1:
        raise Conflict("Cannot move root")
    if new_parent_id == folder.id:
        raise Conflict("Cannot move into itself")
    # ensure new_parent is not a descendant of folder
    cursor = await get(db, new_parent_id)
    while cursor.parent_id is not None:
        if cursor.id == folder.id:
            raise Conflict("Cannot move into a descendant")
        cursor = await db.get(Folder, cursor.parent_id)
    dup = await db.execute(
        select(Folder.id).where(
            and_(
                Folder.parent_id == new_parent_id,
                func.lower(Folder.name) == folder.name.lower(),
                Folder.deleted_at.is_(None),
            )
        )
    )
    if dup.first():
        raise Conflict("A folder with this name already exists in destination")
    folder.parent_id = new_parent_id


async def soft_delete_recursive(db: AsyncSession, folder_id: int) -> None:
    """Mark folder and all descendant folders+files as deleted."""
    if folder_id == 1:
        raise Conflict("Cannot delete root folder")
    now = utcnow()
    # Postgres recursive CTE to collect descendants
    await db.execute(
        update(Folder).where(Folder.id == folder_id).values(deleted_at=now)
    )
    await db.execute(
        update(Folder)
        .where(
            Folder.id.in_(
                select(Folder.id).where(Folder.parent_id == folder_id).scalar_subquery()
            )
        )
        .values(deleted_at=now)
    )
    # full recursive purge — simple loop (small tree typical for family archive)
    queue = [folder_id]
    while queue:
        current = queue.pop()
        children = await db.execute(
            select(Folder.id).where(Folder.parent_id == current)
        )
        for (child_id,) in children:
            queue.append(child_id)
        # delete descendant folders + their files via raw update for atomicity
        await db.execute(
            update(Folder).where(Folder.parent_id == current, Folder.deleted_at.is_(None)).values(deleted_at=now)
        )
    # Also soft-delete files in all affected folders (handled in files repo)
    from app.models import File  # local import to avoid cycle
    await db.execute(
        update(File)
        .where(File.deleted_at.is_(None))
        .where(
            File.folder_id.in_(
                select(Folder.id).where(Folder.deleted_at == now).scalar_subquery()
            )
        )
        .values(deleted_at=now)
    )


async def restore(db: AsyncSession, folder: Folder) -> None:
    folder.deleted_at = None


async def list_trashed(db: AsyncSession) -> list[Folder]:
    res = await db.execute(
        select(Folder).where(Folder.deleted_at.is_not(None)).order_by(Folder.deleted_at.desc())
    )
    return list(res.scalars())


async def breadcrumb(db: AsyncSession, folder_id: int) -> list[Folder]:
    out: list[Folder] = []
    cursor = await db.get(Folder, folder_id)
    while cursor is not None:
        out.append(cursor)
        if cursor.parent_id is None:
            break
        cursor = await db.get(Folder, cursor.parent_id)
    out.reverse()
    return out

