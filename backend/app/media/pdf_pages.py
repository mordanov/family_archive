from __future__ import annotations

import asyncio
import io

import pypdfium2 as pdfium
from PIL import Image


def _page_count(data: bytes) -> int:
    return len(pdfium.PdfDocument(data))


def _render(data: bytes, page_num: int, scale: float = 2.0) -> bytes:
    doc = pdfium.PdfDocument(data)
    if page_num >= len(doc):
        raise IndexError(page_num)
    bitmap = doc[page_num].render(scale=scale, rotation=0)
    img: Image.Image = bitmap.to_pil()
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


async def page_count(data: bytes) -> int:
    return await asyncio.to_thread(_page_count, data)


async def render_page(data: bytes, page_num: int) -> bytes:
    return await asyncio.to_thread(_render, data, page_num)
