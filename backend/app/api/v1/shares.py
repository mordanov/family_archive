from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.core.errors import BadRequest, NotFound
from app.db.session import get_db
from app.repositories import audit as audit_repo
from app.repositories import files as files_repo
from app.repositories import folders as folders_repo
from app.repositories import shares as shares_repo
from app.schemas import (
    FileOut,
    FolderOut,
    ShareCreate,
    ShareOut,
    SharePublicMeta,
    ShareUnlock,
)
from app.services import share_service
from app.storage.object_store import object_store
from app.utils.range_header import parse_range
from app.utils.ratelimit import RateLimiter

router = APIRouter()
_share_password_limiter = RateLimiter(10, 60)


def _ip(r: Request) -> str | None:
    return r.client.host if r.client else None


def _to_out(s) -> ShareOut:
    return ShareOut(
        id=s.id, token=s.token, target_type=s.target_type,
        file_id=s.file_id, folder_id=s.folder_id,
        has_password=bool(s.password_hash),
        expires_at=s.expires_at, max_downloads=s.max_downloads,
        download_count=s.download_count, created_at=s.created_at, revoked_at=s.revoked_at,
    )


# ---------- authenticated management ----------
@router.post("", response_model=ShareOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def create(payload: ShareCreate, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    s = await share_service.create(db, payload=payload, user_id=user.id, ip=_ip(request))
    return _to_out(s)


@router.get("", response_model=list[ShareOut])
async def list_(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return [_to_out(s) for s in await shares_repo.list_active(db)]


@router.delete("/{share_id}", status_code=204, dependencies=[Depends(require_csrf)])
async def revoke(share_id: int, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await share_service.revoke(db, share_id=share_id, user_id=user.id, ip=_ip(request))
    return None


# ---------- public ----------
@router.get("/{token}", response_model=SharePublicMeta)
async def public_meta(token: str, db: AsyncSession = Depends(get_db)):
    s = await shares_repo.get_by_token(db, token)
    if s.target_type == "file":
        f = await files_repo.get(db, s.file_id)
        return SharePublicMeta(
            token=token, target_type="file", name=f.name,
            requires_password=bool(s.password_hash), expires_at=s.expires_at,
            files=[FileOut.model_validate(f)],
        )
    folder = await folders_repo.get(db, s.folder_id)
    children = await folders_repo.list_children(db, folder.id)
    files = await files_repo.list_in_folder(db, folder.id)
    return SharePublicMeta(
        token=token, target_type="folder", name=folder.name or "Shared",
        requires_password=bool(s.password_hash), expires_at=s.expires_at,
        folders=[FolderOut.model_validate(f) for f in children],
        files=[FileOut.model_validate(f) for f in files],
    )


@router.post("/{token}/unlock", status_code=204, dependencies=[Depends(require_csrf)])
async def unlock(token: str, payload: ShareUnlock, request: Request, db: AsyncSession = Depends(get_db)):
    _share_password_limiter.check(f"share-pw:{_ip(request)}:{token}")
    s = await shares_repo.get_by_token(db, token)
    share_service.check_password(s, payload.password)
    return None


@router.get("/{token}/download")
async def public_download(
    token: str, request: Request, db: AsyncSession = Depends(get_db),
    password: str | None = Header(default=None, alias="X-Share-Password"),
    range: str | None = Header(default=None),
):
    s = await shares_repo.get_by_token(db, token)
    share_service.check_password(s, password)
    if s.target_type != "file":
        raise BadRequest("Folder share has no single file; use /file/{path}")
    f = await files_repo.get(db, s.file_id)
    await shares_repo.increment_download(db, s)
    await audit_repo.log(db, user_id=None, action="share_download", entity_type="file", entity_id=f.id, ip=_ip(request),
                         extra={"share_id": s.id})
    rng = parse_range(range, f.size_bytes)
    if rng:
        iterator, _ = await object_store.get_object_stream(f.s3_key, range_header=f"bytes={rng.start}-{rng.end}")
        headers = {
            "Content-Length": str(rng.length),
            "Content-Range": f"bytes {rng.start}-{rng.end}/{f.size_bytes}",
            "Accept-Ranges": "bytes",
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f.name)}",
        }
        return StreamingResponse(iterator, status_code=206, media_type=f.content_type, headers=headers)
    iterator, _ = await object_store.get_object_stream(f.s3_key)
    headers = {
        "Content-Length": str(f.size_bytes),
        "Accept-Ranges": "bytes",
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f.name)}",
    }
    return StreamingResponse(iterator, media_type=f.content_type, headers=headers)

