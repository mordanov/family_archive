"""Physical 90° clockwise rotation of images via Pillow."""
from __future__ import annotations

import asyncio
import io

from PIL import Image, ImageOps

_ORIENTATION_TAG = 274  # EXIF Orientation


def _rotate_90cw_sync(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
        fmt = img.format or "JPEG"
        # Normalise any existing EXIF orientation first so we start from upright.
        img = ImageOps.exif_transpose(img)
        # 90° clockwise in Pillow is a negative (counter-clockwise) angle.
        img = img.rotate(-90, expand=True)
        # Write back a neutral orientation tag so viewers don't double-rotate.
        exif = img.getexif()
        exif[_ORIENTATION_TAG] = 1
        buf = io.BytesIO()
        save_kwargs: dict = {}
        try:
            exif_bytes = exif.tobytes()
            if exif_bytes:
                save_kwargs["exif"] = exif_bytes
        except Exception:
            pass
        if fmt == "JPEG":
            img.save(buf, format="JPEG", quality=92, **save_kwargs)
        elif fmt == "WEBP":
            img.save(buf, format="WEBP", quality=85, **save_kwargs)
        else:
            img.save(buf, format=fmt, **save_kwargs)
        return buf.getvalue()


async def rotate_image_90cw(data: bytes) -> bytes:
    return await asyncio.to_thread(_rotate_90cw_sync, data)
