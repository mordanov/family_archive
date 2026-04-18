from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.db.session import get_db
from app.repositories import audit as audit_repo
from app.repositories import files as files_repo
from app.repositories import folders as folders_repo
from app.repositories import tags as tags_repo
from app.schemas import FileOut, FilePatch
from app.storage.object_store import object_store
from app.utils.filenames import sanitize_name
from app.utils.range_header import parse_range

router = APIRouter()


def _ip(r: Request) -> str | None:
    return r.client.host if r.client else None


@router.get("/{file_id}", response_model=FileOut)
async def get_file(file_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await files_repo.get(db, file_id)


@router.patch("/{file_id}", response_model=FileOut, dependencies=[Depends(require_csrf)])
async def patch_file(file_id: int, payload: FilePatch, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await files_repo.get(db, file_id)
    if payload.name is not None:
        await files_repo.rename(db, f, sanitize_name(payload.name))
        await audit_repo.log(db, user_id=user.id, action="rename", entity_type="file", entity_id=f.id, ip=_ip(request))
    if payload.folder_id is not None and payload.folder_id != f.folder_id:
        await folders_repo.get(db, payload.folder_id)
        await files_repo.move(db, f, payload.folder_id)
        await audit_repo.log(db, user_id=user.id, action="move", entity_type="file", entity_id=f.id, ip=_ip(request))
    return f


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def delete_file(file_id: int, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await files_repo.get(db, file_id)
    await files_repo.soft_delete(db, f)
    await audit_repo.log(db, user_id=user.id, action="delete", entity_type="file", entity_id=f.id, ip=_ip(request))
    return None


async def _stream_file_response(file_id: int, db: AsyncSession, range_header: str | None, attachment: bool):
    f = await files_repo.get(db, file_id)
    rng = parse_range(range_header, f.size_bytes)
    if rng:
        iterator, meta = await object_store.get_object_stream(f.s3_key, range_header=f"bytes={rng.start}-{rng.end}")
        headers = {
            "Content-Length": str(rng.length),
            "Content-Range": f"bytes {rng.start}-{rng.end}/{f.size_bytes}",
            "Accept-Ranges": "bytes",
        }
        status_code = 206
    else:
        iterator, meta = await object_store.get_object_stream(f.s3_key)
        headers = {"Content-Length": str(f.size_bytes), "Accept-Ranges": "bytes"}
        status_code = 200
    if attachment:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(f.name)}"
    headers["X-Content-Type-Options"] = "nosniff"
    return StreamingResponse(iterator, status_code=status_code, media_type=f.content_type, headers=headers)


@router.get("/{file_id}/raw")
async def raw(file_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db),
              range: str | None = Header(default=None)):
    return await _stream_file_response(file_id, db, range, attachment=False)


@router.get("/{file_id}/download")
async def download(file_id: int, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db),
                   range: str | None = Header(default=None)):
    await audit_repo.log(db, user_id=user.id, action="download", entity_type="file", entity_id=file_id, ip=_ip(request))
    return await _stream_file_response(file_id, db, range, attachment=True)


# --- tags on files ---
@router.post("/{file_id}/tags/{tag_id}", status_code=204, dependencies=[Depends(require_csrf)])
async def attach_tag(file_id: int, tag_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await files_repo.get(db, file_id)
    await tags_repo.get(db, tag_id)
    await tags_repo.attach(db, file_id, tag_id)
    return None


@router.delete("/{file_id}/tags/{tag_id}", status_code=204, dependencies=[Depends(require_csrf)])
async def detach_tag(file_id: int, tag_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await tags_repo.detach(db, file_id, tag_id)
    return None

