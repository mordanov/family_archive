from __future__ import annotations

import asyncio
import logging

from app.services import preview_service

log = logging.getLogger(__name__)


async def thumbnail_worker_loop(queue: asyncio.Queue[int]) -> None:
    while True:
        try:
            file_id = await queue.get()
        except asyncio.CancelledError:
            return
        try:
            await preview_service.generate(file_id)
        except Exception as e:
            log.exception("thumbnail worker failure for %s: %s", file_id, e)

