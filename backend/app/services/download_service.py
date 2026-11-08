"""Download progress tracking service backed by PostgreSQL."""
from __future__ import annotations

import time
from typing import AsyncIterator

from app.core.time import utcnow
from app.db import session as db_session
from app.models import Download
from app.repositories import downloads as downloads_repo
from app.schemas import DownloadItemOut

FLUSH_INTERVAL_SEC = 0.5
FLUSH_BYTES_THRESHOLD = 512 * 1024


def to_item_out(d: Download) -> DownloadItemOut:
    total = max(int(d.total_bytes or 0), 0)
    sent = max(int(d.bytes_sent or 0), 0)
    if total > 0:
        pct = round(min(100.0, (sent / total) * 100.0), 1)
    else:
        pct = 100.0 if d.status == "completed" else 0.0

    speed_bps = 0
    if d.status == "active" and sent > 0 and d.started_at:
        elapsed = max((utcnow() - d.started_at).total_seconds(), 0.1)
        speed_bps = int(sent / elapsed)

    return DownloadItemOut(
        id=d.id,
        file_id=d.file_id,
        filename=d.filename,
        source=d.source,  # type: ignore[arg-type]
        username=d.username,
        share_id=d.share_id,
        ip=str(d.ip) if d.ip is not None else None,
        total_bytes=total,
        bytes_sent=sent,
        progress_pct=pct,
        speed_bps=speed_bps,
        status=d.status,  # type: ignore[arg-type]
        started_at=d.started_at,
        updated_at=d.updated_at,
        finished_at=d.finished_at,
    )


async def track_stream(
    iterator: AsyncIterator[bytes],
    *,
    file_id: int | None,
    filename: str,
    source: str,
    total_bytes: int,
    user_id: int | None = None,
    username: str | None = None,
    share_id: int | None = None,
    ip: str | None = None,
) -> AsyncIterator[bytes]:
    """Create a Download row immediately and return a wrapped chunk iterator that flushes progress to DB."""
    async with db_session.AsyncSessionLocal() as db:
        row = await downloads_repo.create(
            db,
            file_id=file_id,
            filename=filename,
            source=source,
            user_id=user_id,
            username=username,
            share_id=share_id,
            ip=ip,
            total_bytes=total_bytes,
        )
        download_id = row.id
        await db.commit()

    async def _wrapped() -> AsyncIterator[bytes]:
        bytes_sent = 0
        last_flush_bytes = 0
        last_flush_time = time.monotonic()
        failed = False
        try:
            async for chunk in iterator:
                bytes_sent += len(chunk)
                now = time.monotonic()
                if (
                    now - last_flush_time >= FLUSH_INTERVAL_SEC
                    or bytes_sent - last_flush_bytes >= FLUSH_BYTES_THRESHOLD
                ):
                    async with db_session.AsyncSessionLocal() as s:
                        await downloads_repo.update_progress(s, download_id, bytes_sent)
                        await s.commit()
                    last_flush_time = now
                    last_flush_bytes = bytes_sent
                yield chunk
        except Exception:
            failed = True
            raise
        finally:
            if failed:
                final_status = "error"
            elif bytes_sent >= total_bytes:
                final_status = "completed"
            else:
                final_status = "aborted"
            async with db_session.AsyncSessionLocal() as s:
                await downloads_repo.finish(s, download_id, bytes_sent, final_status)
                await s.commit()

    return _wrapped()
