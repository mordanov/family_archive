from __future__ import annotations

import uuid as uuid_lib
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models import Download

STALE_SECONDS = 60


async def create(
    db: AsyncSession,
    *,
    file_id: int | None,
    filename: str,
    source: str,
    user_id: int | None = None,
    username: str | None = None,
    share_id: int | None = None,
    ip: str | None = None,
    total_bytes: int,
) -> Download:
    now = utcnow()
    row = Download(
        id=uuid_lib.uuid4(),
        file_id=file_id,
        filename=filename,
        source=source,
        user_id=user_id,
        username=username,
        share_id=share_id,
        ip=ip,
        total_bytes=total_bytes,
        bytes_sent=0,
        status="active",
        started_at=now,
        updated_at=now,
    )
    db.add(row)
    await db.flush()
    return row


async def update_progress(db: AsyncSession, download_id: uuid_lib.UUID, bytes_sent: int) -> None:
    await db.execute(
        update(Download)
        .where(Download.id == download_id)
        .values(bytes_sent=bytes_sent, updated_at=utcnow())
    )


async def finish(db: AsyncSession, download_id: uuid_lib.UUID, bytes_sent: int, status: str) -> None:
    now = utcnow()
    await db.execute(
        update(Download)
        .where(Download.id == download_id)
        .values(bytes_sent=bytes_sent, status=status, updated_at=now, finished_at=now)
    )


async def cleanup_stale(db: AsyncSession) -> None:
    cutoff = utcnow() - timedelta(seconds=STALE_SECONDS)
    await db.execute(
        update(Download)
        .where(Download.status == "active", Download.updated_at < cutoff)
        .values(status="aborted", finished_at=Download.updated_at)
    )


async def list_active(db: AsyncSession) -> list[Download]:
    res = await db.execute(
        select(Download)
        .where(Download.status == "active")
        .order_by(Download.started_at.desc())
    )
    return list(res.scalars())


async def list_history(db: AsyncSession, limit: int = 100) -> list[Download]:
    res = await db.execute(
        select(Download)
        .where(Download.status != "active")
        .order_by(Download.started_at.desc())
        .limit(limit)
    )
    return list(res.scalars())
