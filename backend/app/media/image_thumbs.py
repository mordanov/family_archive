"""Image thumbnail generation using Pillow."""
from __future__ import annotations

import io

from PIL import Image, ImageOps

THUMB_SIZES = (256, 1024)


def make_thumbnail(image_bytes: bytes, max_side: int) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        out = io.BytesIO()
        im.save(out, format="WEBP", quality=82, method=4)
        return out.getvalue()

