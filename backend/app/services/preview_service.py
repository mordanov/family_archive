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
QUEUE = None  # asyncio.Queue, assigned at startup

_PREWARM_SEMAPHORE: asyncio.Semaphore | None = None
_PREWARM_IN_FLIGHT: set[int] = set()
_PREWARM_LOCK = asyncio.Lock()


def _prewarm_semaphore() -> asyncio.Semaphore:
    global _PREWARM_SEMAPHORE
    if _PREWARM_SEMAPHORE is None:
        _PREWARM_SEMAPHORE = asyncio.Semaphore(max(1, settings.PREWARM_THUMBNAIL_CONCURRENCY))
    return _PREWARM_SEMAPHORE


async def generate_for_new_file(file: File) -> None:
    """Decide inline vs background generation."""
    if file.size_bytes <= settings.INLINE_THUMBNAIL_MAX_BYTES:
        # Fire-and-forget: don't hold the caller's DB connection while generating.
        asyncio.create_task(_generate_inline(file.id))
    else:
        if QUEUE is not None:
            await QUEUE.put(file.id)


async def _generate_inline(file_id: int) -> None:
    try:
        await generate(file_id)
    except Exception as e:
        log.warning("inline preview generation failed for file %s: %s", file_id, e)


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
    """Generate local thumbnail on demand for image/video files."""
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

    try:
        if ct.startswith("image/"):
            update_kwargs = await _do_image(f)
        else:
            update_kwargs = await _do_video(f, include_poster=False)
    except Exception as e:
        log.warning("on-demand thumbnail generation failed for file %s: %s", f.id, e)
        return False

    if update_kwargs.get("has_thumb"):
        async with AsyncSessionLocal() as db:
            await files_repo.mark_thumbnail(db, f.id, has_thumb=True)
            await db.commit()
        return True
    return False


async def prewarm_thumbnails(file_ids: list[int]) -> int:
    """Schedule non-blocking thumbnail generation for provided file IDs."""
    queued = 0
    for file_id in dict.fromkeys(file_ids):
        async with _PREWARM_LOCK:
            if file_id in _PREWARM_IN_FLIGHT:
                continue
            _PREWARM_IN_FLIGHT.add(file_id)
        asyncio.create_task(_run_prewarm_job(file_id))
        queued += 1
    return queued


async def _run_prewarm_job(file_id: int) -> None:
    sem = _prewarm_semaphore()
    try:
        async with sem:
            await _generate_inline(file_id)
    finally:
        async with _PREWARM_LOCK:
            _PREWARM_IN_FLIGHT.discard(file_id)


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
