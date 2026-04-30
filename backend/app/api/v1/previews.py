from __future__ import annotations

import asyncio
import io
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from PIL import ExifTags, Image, ImageOps

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.core.errors import NotFound
from app.db.session import AsyncSessionLocal, get_db
from app.models import File
from app.repositories import files as files_repo
from app.schemas import ThumbnailPrewarmIn
from app.services import preview_service
from app.storage.object_store import object_store
from app.storage.thumbnail_store import thumbnail_store

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{file_id}/thumbnail")
async def thumbnail(file_id: int, user: CurrentUser, size: int = Query(256)):
    if size != 256:
        raise HTTPException(400, "size must be 256")
    async with AsyncSessionLocal() as db:
        f = await files_repo.get(db, file_id)
    ct = (f.content_type or "").lower()
    if not (ct.startswith("image/") or ct.startswith("video/")):
        raise NotFound("Thumbnail not available")

    path = thumbnail_store.path_for(f.uuid, size)
    if not path.exists():
        ok = await preview_service.ensure_thumbnail(file_id, file=f)
        if not ok or not path.exists():
            raise NotFound("Thumbnail not available")

    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.get("/{file_id}/poster")
async def poster(file_id: int, user: CurrentUser):
    async with AsyncSessionLocal() as db:
        f = await files_repo.get(db, file_id)
    if not f.has_poster:
        raise NotFound("Poster not available")
    iterator, _ = await object_store.get_object_stream(f"posters/{f.uuid}.jpg")
    return StreamingResponse(
        iterator,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.get("/{file_id}/audio-meta")
async def audio_meta(file_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await files_repo.get(db, file_id)
    return f.audio_meta or {}


@router.get("/{file_id}/meta")
async def file_meta(file_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await files_repo.get(db, file_id)
    ct = (f.content_type or "").lower()
    base: dict = {"size_bytes": f.size_bytes, "name": f.name, "content_type": f.content_type}
    if ct.startswith("image/"):
        return {**base, **(await _image_meta(f))}
    if ct.startswith("video/"):
        return {**base, **(await _video_meta(f))}
    return base


async def _read_object(key: str) -> bytes:
    iterator, _ = await object_store.get_object_stream(key)
    chunks: list[bytes] = []
    async for chunk in iterator:
        chunks.append(chunk)
    return b"".join(chunks)


def _to_scalar(value):
    if isinstance(value, bytes):
        return None
    if isinstance(value, str):
        s = value.strip("\x00").strip()
        return s if s else None
    # IFDRational (Pillow 9+) or plain tuple rational (older Pillow)
    if hasattr(value, "numerator") and hasattr(value, "denominator"):
        try:
            return float(value)
        except (ZeroDivisionError, TypeError):
            return None
    if isinstance(value, tuple) and len(value) == 2:
        n, d = value
        if d == 0:
            return None
        return round(n / d, 6)
    if isinstance(value, (int, float)):
        return value
    return None


def _parse_gps_dms(dms, ref) -> float | None:
    if not dms or len(dms) < 3:
        return None
    try:
        def _deg(v):
            if hasattr(v, "numerator") and hasattr(v, "denominator"):
                return float(v)
            if isinstance(v, tuple) and len(v) == 2 and v[1]:
                return v[0] / v[1]
            return float(v)
        degrees = _deg(dms[0]) + _deg(dms[1]) / 60 + _deg(dms[2]) / 3600
        if ref in ("S", "W"):
            degrees = -degrees
        return round(degrees, 6)
    except Exception:
        return None


def _extract_image_meta(data: bytes) -> dict:
    out: dict = {}
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            out["width"] = img.width
            out["height"] = img.height
            out["format"] = img.format
            exif = img.getexif()
            for tag_id, value in exif.items():
                name = ExifTags.TAGS.get(tag_id)
                if not name:
                    continue
                scalar = _to_scalar(value)
                if scalar is not None:
                    out[name] = scalar
            # GPS sub-IFD
            try:
                gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
            except AttributeError:
                try:
                    gps_ifd = exif.get_ifd(34853)
                except Exception:
                    gps_ifd = {}
            if gps_ifd:
                lat = _parse_gps_dms(gps_ifd.get(2), gps_ifd.get(1))
                lon = _parse_gps_dms(gps_ifd.get(4), gps_ifd.get(3))
                if lat is not None:
                    out["GPSLatitude"] = lat
                if lon is not None:
                    out["GPSLongitude"] = lon
    except Exception as e:
        log.debug("image meta extraction failed: %s", e)
    return out


async def _image_meta(f: File) -> dict:
    data = await _read_object(f.s3_key)
    return await asyncio.to_thread(_extract_image_meta, data)


async def _video_meta(f: File) -> dict:
    url = await object_store.presign_get_url(f.s3_key, expires_in=300)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_streams", "-show_format",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        probe = json.loads(stdout)
    except Exception as e:
        log.debug("ffprobe meta failed: %s", e)
        return {}
    out: dict = {}
    fmt = probe.get("format", {})
    if "duration" in fmt:
        out["duration"] = round(float(fmt["duration"]), 2)
    if "bit_rate" in fmt:
        out["bit_rate"] = int(fmt["bit_rate"])
    for stream in probe.get("streams", []):
        codec_type = stream.get("codec_type")
        if codec_type == "video" and "video_codec" not in out:
            out["video_codec"] = stream.get("codec_name")
            out["width"] = stream.get("width")
            out["height"] = stream.get("height")
            r = stream.get("r_frame_rate", "")
            if "/" in r:
                n, d = r.split("/")
                if d and int(d):
                    out["fps"] = round(int(n) / int(d), 2)
        elif codec_type == "audio" and "audio_codec" not in out:
            out["audio_codec"] = stream.get("codec_name")
            out["audio_channels"] = stream.get("channels")
            out["audio_sample_rate"] = stream.get("sample_rate")
    return {k: v for k, v in out.items() if v is not None}


@router.post("/thumbnails/prewarm", dependencies=[Depends(require_csrf)])
async def prewarm_thumbnails(payload: ThumbnailPrewarmIn, user: CurrentUser):
    queued = await preview_service.prewarm_thumbnails(payload.file_ids)
    return {"queued": queued}


