"""Preview generation: thumbnails (image), poster (video), audio meta."""
from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.media.audio_meta import extract_meta as audio_meta_extract
from app.media.image_thumbs import make_thumbnail
from app.media.video_poster import make_poster_from_bytes
from app.models import File
from app.repositories import files as files_repo
from app.storage.object_store import object_store
from app.storage.thumbnail_store import thumbnail_store

log = logging.getLogger(__name__)

# In-process queue (set up by workers.manager)
QUEUE: asyncio.Queue[int] | None = None  # assigned at startup

_IN_FLIGHT: set[int] = set()
_IN_FLIGHT_LOCK: asyncio.Lock = asyncio.Lock()


async def _enqueue(file_id: int, *, nowait: bool = False) -> bool:
    async with _IN_FLIGHT_LOCK:
        if file_id in _IN_FLIGHT:
            return True  # already queued or processing
        if QUEUE is None:
            return False
        try:
            if nowait:
                QUEUE.put_nowait(file_id)
            else:
                await QUEUE.put(file_id)
        except asyncio.QueueFull:
            return False
        _IN_FLIGHT.add(file_id)
    return True


async def release_job(file_id: int) -> None:
    async with _IN_FLIGHT_LOCK:
        _IN_FLIGHT.discard(file_id)


async def generate_for_new_file(file: File) -> None:
    await _enqueue(file.id)


async def generate(file_id: int) -> None:
    """Top-level entry. Loads file, dispatches by content type."""
    # Phase 1: fetch — acquire and immediately release the DB connection.
    async with AsyncSessionLocal() as db:
        f = await files_repo.get(db, file_id, include_deleted=True)

    # Phase 2: S3 I/O + media processing — no DB connection held.
    ct = (f.content_type or "").lower()
    update_kwargs: dict = {}
    try:
        if ct.startswith("image/"):
            update_kwargs = await _do_image(f)
        elif ct.startswith("video/"):
            update_kwargs = await _do_video(f, include_poster=True)
        elif ct.startswith("audio/"):
            update_kwargs = await _do_audio(f)
    except Exception as e:
        log.exception("preview gen failed for %s: %s", f.id, e)
        return

    # Phase 3: write result — acquire and immediately release the DB connection.
    if update_kwargs:
        async with AsyncSessionLocal() as db:
            await files_repo.mark_thumbnail(db, f.id, **update_kwargs)
            await db.commit()


async def _read_object(key: str) -> bytes:
    iterator, meta = await object_store.get_object_stream(key)
    chunks = []
    async for c in iterator:
        chunks.append(c)
    return b"".join(chunks)


async def ensure_thumbnail(file_id: int) -> bool:
    """On-demand thumbnail via UI. Queues generation; returns False if queue full."""
    async with AsyncSessionLocal() as db:
        f = await files_repo.get(db, file_id)

    ct = (f.content_type or "").lower()
    if not (ct.startswith("image/") or ct.startswith("video/")):
        return False

    if thumbnail_store.path_for(f.uuid, settings.THUMBNAIL_MAX_SIDE).exists():
        if not f.has_thumbnail:
            async with AsyncSessionLocal() as db:
                await files_repo.mark_thumbnail(db, f.id, has_thumb=True)
                await db.commit()
        return True

    return await _enqueue(file_id, nowait=True)


async def prewarm_thumbnails(file_ids: list[int]) -> int:
    """Schedule thumbnail generation for provided file IDs."""
    queued = 0
    for file_id in dict.fromkeys(file_ids):
        if await _enqueue(file_id, nowait=True):
            queued += 1
    return queued


async def _do_image(f: File) -> dict:
    data = await _read_object(f.s3_key)
    try:
        thumb = make_thumbnail(data, settings.THUMBNAIL_MAX_SIDE)
        await thumbnail_store.write_thumbnail(f.uuid, thumb, settings.THUMBNAIL_MAX_SIDE)
    except Exception as e:
        log.warning("thumbnail generation failed for image %s: %s", f.id, e)
        return {}
    return {"has_thumb": True}


async def _do_video(f: File, *, include_poster: bool) -> dict:
    data = await _read_object(f.s3_key)
    poster_max_side = 1024 if include_poster else settings.THUMBNAIL_MAX_SIDE
    poster = await make_poster_from_bytes(data, max_side=poster_max_side)
    if not poster:
        return {}
    try:
        thumb = make_thumbnail(poster, settings.THUMBNAIL_MAX_SIDE)
        await thumbnail_store.write_thumbnail(f.uuid, thumb, settings.THUMBNAIL_MAX_SIDE)
    except Exception as e:
        log.warning("thumbnail generation failed for video %s: %s", f.id, e)
        return {}

    out = {"has_thumb": True}
    if include_poster:
        await object_store.put_object(f"posters/{f.uuid}.jpg", poster, "image/jpeg")
        out["has_poster"] = True
    return out


async def _do_audio(f: File) -> dict:
    data = await _read_object(f.s3_key)
    meta = audio_meta_extract(data)
    return {"audio_meta": meta or None}
