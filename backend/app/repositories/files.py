from __future__ import annotations

from datetime import timedelta

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.errors import Conflict, NotFound
from app.core.time import utcnow
from app.models import File


async def get(db: AsyncSession, file_id: int, include_deleted: bool = False) -> File:
    res = await db.execute(
        select(File).options(selectinload(File.tags)).where(File.id == file_id)
    )
    f = res.scalar_one_or_none()
    if not f or (not include_deleted and f.deleted_at is not None):
        raise NotFound("File not found")
    return f


async def list_in_folder(db: AsyncSession, folder_id: int) -> list[File]:
    res = await db.execute(
        select(File)
        .options(selectinload(File.tags))
        .where(and_(File.folder_id == folder_id, File.deleted_at.is_(None)))
        .order_by(func.lower(File.name))
    )
    return list(res.scalars())


async def assert_unique_name(db: AsyncSession, folder_id: int, name: str, exclude_id: int | None = None) -> None:
    q = select(File.id).where(
        and_(
            File.folder_id == folder_id,
            func.lower(File.name) == name.lower(),
            File.deleted_at.is_(None),
        )
    )
    if exclude_id is not None:
        q = q.where(File.id != exclude_id)
    if (await db.execute(q)).first():
        raise Conflict("A file with this name already exists here")


async def create(
    db: AsyncSession,
    folder_id: int,
    name: str,
    size_bytes: int,
    content_type: str,
    s3_key: str,
    user_id: int,
) -> File:
    await assert_unique_name(db, folder_id, name)
    f = File(
        folder_id=folder_id,
        name=name,
        size_bytes=size_bytes,
        content_type=content_type,
        s3_key=s3_key,
        created_by=user_id,
    )
    db.add(f)
    await db.flush()
    await db.refresh(f, attribute_names=["uuid", "created_at", "updated_at", "tags"])
    return f


async def rename(db: AsyncSession, file: File, new_name: str) -> None:
    await assert_unique_name(db, file.folder_id, new_name, exclude_id=file.id)
    file.name = new_name


async def move(db: AsyncSession, file: File, new_folder_id: int) -> None:
    await assert_unique_name(db, new_folder_id, file.name)
    file.folder_id = new_folder_id


async def soft_delete(db: AsyncSession, file: File) -> None:
    file.deleted_at = utcnow()


async def restore(db: AsyncSession, file: File) -> None:
    file.deleted_at = None


async def list_trashed(db: AsyncSession) -> list[File]:
    res = await db.execute(
        select(File)
        .options(selectinload(File.tags))
        .where(File.deleted_at.is_not(None))
        .order_by(File.deleted_at.desc())
    )
    return list(res.scalars())


async def list_due_for_purge(db: AsyncSession) -> list[File]:
    cutoff = utcnow() - timedelta(days=settings.TRASH_RETENTION_DAYS)
    res = await db.execute(select(File).where(File.deleted_at.is_not(None), File.deleted_at < cutoff))
    return list(res.scalars())


async def hard_delete(db: AsyncSession, file: File) -> None:
    await db.delete(file)


async def mark_thumbnail(db: AsyncSession, file_id: int, *, has_thumb: bool = False, has_poster: bool = False, audio_meta: dict | None = None) -> None:
    values: dict = {}
    if has_thumb:
        values["has_thumbnail"] = True
    if has_poster:
        values["has_poster"] = True
    if audio_meta is not None:
        values["audio_meta"] = audio_meta
    if values:
        await db.execute(update(File).where(File.id == file_id).values(**values))

