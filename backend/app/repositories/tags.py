from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.models import File, FileTag, Tag


async def list_all(db: AsyncSession) -> list[Tag]:
    res = await db.execute(select(Tag).order_by(Tag.name))
    return list(res.scalars())


async def get_or_create(db: AsyncSession, name: str, color: str | None = None) -> Tag:
    res = await db.execute(select(Tag).where(Tag.name == name))
    t = res.scalar_one_or_none()
    if t:
        return t
    t = Tag(name=name, color=color)
    db.add(t)
    await db.flush()
    return t


async def get(db: AsyncSession, tag_id: int) -> Tag:
    t = await db.get(Tag, tag_id)
    if not t:
        raise NotFound("Tag not found")
    return t


async def attach(db: AsyncSession, file_id: int, tag_id: int) -> None:
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = pg_insert(FileTag).values(file_id=file_id, tag_id=tag_id).on_conflict_do_nothing()
    await db.execute(stmt)


async def detach(db: AsyncSession, file_id: int, tag_id: int) -> None:
    from sqlalchemy import delete

    await db.execute(delete(FileTag).where(FileTag.file_id == file_id, FileTag.tag_id == tag_id))


async def delete(db: AsyncSession, tag: Tag) -> None:
    await db.delete(tag)


async def files_with_tag(db: AsyncSession, tag_id: int) -> list[File]:
    from sqlalchemy.orm import selectinload

    res = await db.execute(
        select(File)
        .options(selectinload(File.tags))
        .join(FileTag, FileTag.file_id == File.id)
        .where(FileTag.tag_id == tag_id, File.deleted_at.is_(None))
        .order_by(File.created_at.desc())
    )
    return list(res.scalars())

