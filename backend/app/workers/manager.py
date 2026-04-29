"""Worker management: spin up background tasks alongside the FastAPI app."""
from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.services import preview_service
from app.workers.multipart_gc_worker import multipart_gc_loop
from app.workers.thumbnail_worker import thumbnail_worker_loop
from app.workers.trash_purge_worker import trash_purge_loop

log = logging.getLogger(__name__)


class WorkerManager:
    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        queue: asyncio.Queue[int] = asyncio.Queue(maxsize=1024)
        preview_service.QUEUE = queue
        worker_count = max(1, settings.THUMBNAIL_WORKER_COUNT)
        for i in range(worker_count):
            self._tasks.append(asyncio.create_task(
                thumbnail_worker_loop(queue), name=f"thumbnail-worker-{i}"
            ))
        self._tasks.append(asyncio.create_task(trash_purge_loop(), name="trash-purge"))
        self._tasks.append(asyncio.create_task(multipart_gc_loop(), name="multipart-gc"))
        log.info("Background workers started: %d (%d thumbnail workers)", len(self._tasks), worker_count)

    async def stop(self) -> None:
        for t in self._tasks:
            t.cancel()
        for t in self._tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        self._tasks.clear()


manager = WorkerManager()

