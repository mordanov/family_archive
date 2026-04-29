from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.core.errors import NotFound
from app.db.session import get_db
from app.repositories import files as files_repo
from app.schemas import ThumbnailPrewarmIn
from app.services import preview_service
from app.storage.object_store import object_store
from app.storage.thumbnail_store import thumbnail_store

router = APIRouter()


@router.get("/{file_id}/thumbnail")
async def thumbnail(file_id: int, user: CurrentUser,
                    size: int = Query(256), db: AsyncSession = Depends(get_db)):
    if size != 256:
        raise HTTPException(400, "size must be 256")
    f = await files_repo.get(db, file_id)
    ct = (f.content_type or "").lower()
    if not (ct.startswith("image/") or ct.startswith("video/")):
        raise NotFound("Thumbnail not available")

    path = thumbnail_store.path_for(f.uuid, size)
    if not path.exists():
        ok = await preview_service.ensure_thumbnail(file_id)
        if not ok or not path.exists():
            raise NotFound("Thumbnail not available")

    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.get("/{file_id}/poster")
async def poster(file_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
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


@router.post("/thumbnails/prewarm", dependencies=[Depends(require_csrf)])
async def prewarm_thumbnails(payload: ThumbnailPrewarmIn, user: CurrentUser):
    queued = await preview_service.prewarm_thumbnails(payload.file_ids)
    return {"queued": queued}


