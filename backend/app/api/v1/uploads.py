from __future__ import annotations

import uuid as uuid_lib

from fastapi import APIRouter, Depends, Path, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.core.config import settings
from app.core.errors import TooLarge
from app.db.session import get_db
from app.schemas import (
    UploadCompleteOut,
    UploadCreate,
    UploadOut,
    UploadPartInfo,
    FileOut,
)
from app.services import upload_service

router = APIRouter()


def _ip(r: Request) -> str | None:
    return r.client.host if r.client else None


def _to_out(up) -> UploadOut:
    return UploadOut(
        id=up.id,
        folder_id=up.folder_id,
        filename=up.filename,
        size_bytes=up.size_bytes,
        content_type=up.content_type,
        chunk_size=up.chunk_size,
        total_parts=up.total_parts,
        status=up.status,
        parts=[UploadPartInfo(part_number=p.part_number, size=p.size_bytes, etag=p.etag) for p in up.parts],
    )


@router.post("", response_model=UploadOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def init(payload: UploadCreate, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    up = await upload_service.init_upload(
        db,
        user_id=user.id,
        folder_id=payload.folder_id,
        filename=payload.filename,
        size_bytes=payload.size_bytes,
        content_type=payload.content_type,
        ip=_ip(request),
    )
    return _to_out(up)


@router.get("/{upload_id}", response_model=UploadOut)
async def info(upload_id: uuid_lib.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    up = await upload_service.resume_info(db, upload_id=upload_id, user_id=user.id)
    return _to_out(up)


@router.put("/{upload_id}/parts/{part_number}", dependencies=[Depends(require_csrf)])
async def upload_part(
    upload_id: uuid_lib.UUID,
    part_number: int = Path(..., ge=1, le=10000),
    user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    body = await request.body()
    if len(body) > settings.CHUNK_SIZE_BYTES + 1024:
        raise TooLarge("Chunk too large")
    etag = await upload_service.receive_part(
        db, upload_id=upload_id, user_id=user.id, part_number=part_number, body=body
    )
    return {"part_number": part_number, "size": len(body), "etag": etag}


@router.post("/{upload_id}/complete", response_model=UploadCompleteOut, dependencies=[Depends(require_csrf)])
async def complete(upload_id: uuid_lib.UUID, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    file = await upload_service.complete_upload(db, upload_id=upload_id, user_id=user.id, ip=_ip(request))
    return UploadCompleteOut(file=FileOut.model_validate(file))


@router.delete("/{upload_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def abort(upload_id: uuid_lib.UUID, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await upload_service.abort_upload(db, upload_id=upload_id, user_id=user.id, ip=_ip(request))
    return None

