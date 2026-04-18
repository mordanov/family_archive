from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFound
from app.models import Upload, UploadPart


async def get(db: AsyncSession, upload_id: uuid.UUID, user_id: int | None = None) -> Upload:
    res = await db.execute(
        select(Upload).options(selectinload(Upload.parts)).where(Upload.id == upload_id)
    )
    up = res.scalar_one_or_none()
    if not up or (user_id is not None and up.user_id != user_id):
        raise NotFound("Upload not found")
    return up


async def create(db: AsyncSession, **fields) -> Upload:
    up = Upload(**fields)
    db.add(up)
    await db.flush()
    await db.refresh(up, attribute_names=["created_at"])
    return up


async def upsert_part(
    db: AsyncSession, upload_id: uuid.UUID, part_number: int, etag: str, size_bytes: int
) -> None:
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = pg_insert(UploadPart).values(
        upload_id=upload_id, part_number=part_number, etag=etag, size_bytes=size_bytes
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[UploadPart.upload_id, UploadPart.part_number],
        set_={"etag": etag, "size_bytes": size_bytes},
    )
    await db.execute(stmt)


async def mark_status(db: AsyncSession, up: Upload, status: str) -> None:
    up.status = status
    if status == "completed":
        from app.core.time import utcnow
        up.completed_at = utcnow()

