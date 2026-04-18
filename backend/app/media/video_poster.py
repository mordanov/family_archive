"""Generate a poster JPG from a video by invoking ffmpeg as a subprocess."""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile

log = logging.getLogger(__name__)


async def make_poster_from_bytes(video_bytes: bytes, max_side: int = 1024) -> bytes | None:
    """Write video to a tmp file and ask ffmpeg for a single frame."""
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tf:
        tf.write(video_bytes)
        in_path = tf.name
    out_path = in_path + ".jpg"
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", in_path,
            "-vf", f"thumbnail,scale='min({max_side},iw)':-1",
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
        for p in (in_path, out_path):
            try:
                os.unlink(p)
            except FileNotFoundError:
                pass

