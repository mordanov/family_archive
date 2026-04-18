"""Filename / path sanitization."""
from __future__ import annotations

import unicodedata

from app.core.errors import BadRequest

MAX_NAME_LEN = 255
FORBIDDEN_CHARS = set('/\\\0')


def sanitize_name(raw: str) -> str:
    if raw is None:
        raise BadRequest("Empty name")
    name = unicodedata.normalize("NFC", raw).strip()
    if not name or name in (".", ".."):
        raise BadRequest("Invalid name")
    if any(ch in FORBIDDEN_CHARS for ch in name):
        raise BadRequest("Name contains forbidden characters")
    # remove control characters
    name = "".join(ch for ch in name if ord(ch) >= 32)
    if not name:
        raise BadRequest("Invalid name")
    if len(name) > MAX_NAME_LEN:
        raise BadRequest(f"Name longer than {MAX_NAME_LEN} characters")
    return name

