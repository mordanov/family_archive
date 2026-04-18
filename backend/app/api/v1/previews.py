from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.core.errors import NotFound
from app.db.session import get_db
from app.repositories import files as files_repo
from app.storage.object_store import object_store

router = APIRouter()


@router.get("/{file_id}/thumbnail")
async def thumbnail(file_id: int, user: CurrentUser,
                    size: int = Query(256), db: AsyncSession = Depends(get_db)):
    if size not in (256, 1024):
        raise HTTPException(400, "size must be 256 or 1024")
    f = await files_repo.get(db, file_id)
    if not f.has_thumbnail:
        raise NotFound("Thumbnail not available")
    iterator, meta = await object_store.get_object_stream(f"thumbnails/{f.uuid}/{size}.webp")
    return StreamingResponse(
        iterator,
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

