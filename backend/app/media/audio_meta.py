"""Audio metadata extraction with mutagen."""
from __future__ import annotations

import io
import logging

from mutagen import File as MutaFile

log = logging.getLogger(__name__)


def extract_meta(audio_bytes: bytes) -> dict:
    """Return small JSON-friendly dict: duration, bitrate, title, artist, album."""
    out: dict = {}
    try:
        f = MutaFile(io.BytesIO(audio_bytes))
        if f is None:
            return out
        if f.info:
            if hasattr(f.info, "length"):
                out["duration"] = round(float(f.info.length), 2)
            if hasattr(f.info, "bitrate"):
                out["bitrate"] = int(f.info.bitrate)
        tags = f.tags or {}

        def first(key_aliases):
            for k in key_aliases:
                v = tags.get(k)
                if v:
                    if isinstance(v, list):
                        v = v[0]
                    s = str(v).strip()
                    if s:
                        return s
            return None

        out["title"] = first(["TIT2", "title", "\xa9nam"])
        out["artist"] = first(["TPE1", "artist", "\xa9ART"])
        out["album"] = first(["TALB", "album", "\xa9alb"])
    except Exception as e:
        log.warning("audio meta extraction failed: %s", e)
    return {k: v for k, v in out.items() if v is not None}

