"""Local filesystem-backed thumbnail storage."""
from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from uuid import UUID

from app.core.config import settings


class ThumbnailStore:
    def __init__(self, base_dir: str) -> None:
        self.base_dir = Path(base_dir)

    def path_for(self, file_uuid: UUID, size: int | None = None) -> Path:
        thumb_size = size or settings.THUMBNAIL_MAX_SIDE
        return self.base_dir / str(file_uuid) / f"{thumb_size}.webp"

    async def write_thumbnail(self, file_uuid: UUID, data: bytes, size: int | None = None) -> Path:
        path = self.path_for(file_uuid, size)

        def _write() -> Path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return path

        return await asyncio.to_thread(_write)

    async def delete_for(self, file_uuid: UUID) -> None:
        target = self.base_dir / str(file_uuid)

        def _delete() -> None:
            shutil.rmtree(target, ignore_errors=True)

        await asyncio.to_thread(_delete)


thumbnail_store = ThumbnailStore(settings.THUMBNAIL_DIR)

