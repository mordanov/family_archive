from __future__ import annotations

import asyncio
import logging

from app.db.session import AsyncSessionLocal
from app.services.trash_service import purge_due

log = logging.getLogger(__name__)
INTERVAL_SECONDS = 6 * 60 * 60  # 6 hours


async def trash_purge_loop() -> None:
    while True:
        try:
            async with AsyncSessionLocal() as db:
                count = await purge_due(db)
                await db.commit()
                if count:
                    log.info("trash purge: deleted %d files", count)
        except asyncio.CancelledError:
            return
        except Exception as e:
            log.exception("trash purge cycle failed: %s", e)
        try:
            await asyncio.sleep(INTERVAL_SECONDS)
        except asyncio.CancelledError:
            return

