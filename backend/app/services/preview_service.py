"""Preview generation: thumbnails (image), poster (video), audio meta."""
from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.media.audio_meta import extract_meta as audio_meta_extract
from app.media.image_thumbs import THUMB_SIZES, make_thumbnail
from app.media.video_poster import make_poster_from_bytes
from app.models import File
from app.repositories import files as files_repo
from app.storage.object_store import object_store

log = logging.getLogger(__name__)

# In-process queue (set up by workers.manager)
QUEUE = None  # asyncio.Queue, assigned at startup


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
            update_kwargs = await _do_video(f)
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


async def _do_image(f: File) -> dict:
    data = await _read_object(f.s3_key)
    for size in THUMB_SIZES:
        try:
            thumb = make_thumbnail(data, size)
            await object_store.put_object(
                f"thumbnails/{f.uuid}/{size}.webp", thumb, "image/webp"
            )
        except Exception as e:
            log.warning("thumb %s failed for %s: %s", size, f.id, e)
            return {}
    return {"has_thumb": True}


async def _do_video(f: File) -> dict:
    data = await _read_object(f.s3_key)
    poster = await make_poster_from_bytes(data)
    if not poster:
        return {}
    await object_store.put_object(f"posters/{f.uuid}.jpg", poster, "image/jpeg")
    return {"has_poster": True}


async def _do_audio(f: File) -> dict:
    data = await _read_object(f.s3_key)
    meta = audio_meta_extract(data)
    return {"audio_meta": meta or None}
