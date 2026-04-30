"""Generate a poster JPG from a video by invoking ffmpeg with a presigned URL input."""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile

log = logging.getLogger(__name__)


async def make_poster_from_url(url: str, max_side: int = 1024) -> bytes | None:
    """Extract a single frame from a video URL without downloading the full file.

    Uses ffmpeg's HTTP client with input-seeking so only a small portion of the
    video is fetched over the network (ffmpeg issues range requests as needed).
    """
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
        out_path = tf.name
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-ss", "1",                               # fast input-seek; avoids black intro frames
            "-i", url,
            "-vf", f"scale='min({max_side},iw)':-1",  # resize, preserve aspect ratio
            "-frames:v", "1",
            "-q:v", "4",
            out_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        rc = await proc.wait()
        if rc != 0 or not os.path.exists(out_path):
            return None
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(out_path)
        except FileNotFoundError:
            pass
