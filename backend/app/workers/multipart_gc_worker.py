from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import Upload
from app.storage.object_store import object_store

log = logging.getLogger(__name__)
INTERVAL_SECONDS = 60 * 60  # hourly


async def multipart_gc_loop() -> None:
    while True:
        try:
            await _cycle()
        except asyncio.CancelledError:
            return
        except Exception as e:
            log.exception("multipart GC failed: %s", e)
        try:
            await asyncio.sleep(INTERVAL_SECONDS)
        except asyncio.CancelledError:
            return


async def _cycle() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.MULTIPART_GC_AFTER_HOURS)
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(Upload).where(Upload.status == "uploading", Upload.created_at < cutoff)
        )
        old = list(res.scalars())
        for u in old:
            try:
                await object_store.abort_multipart(u.s3_key, u.s3_upload_id)
            except Exception as e:
                log.warning("abort %s failed: %s", u.id, e)
            await db.execute(update(Upload).where(Upload.id == u.id).values(status="aborted"))
        if old:
            await db.commit()
            log.info("multipart GC aborted %d uploads", len(old))

