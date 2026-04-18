from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.db.session import get_db
from app.repositories import audit as audit_repo
from app.repositories import files as files_repo
from app.repositories import folders as folders_repo
from app.schemas import (
    Breadcrumb,
    FileOut,
    FolderCreate,
    FolderDetail,
    FolderListing,
    FolderOut,
    FolderPatch,
)
from app.utils.filenames import sanitize_name

router = APIRouter()


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/{folder_id}", response_model=FolderDetail)
async def get_folder(folder_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await folders_repo.get(db, folder_id)
    crumbs = await folders_repo.breadcrumb(db, folder_id)
    return FolderDetail(
        folder=FolderOut.model_validate(f),
        breadcrumb=[Breadcrumb(id=c.id, name=c.name or "Home") for c in crumbs],
    )


@router.get("/{folder_id}/children", response_model=FolderListing)
async def list_children(folder_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await folders_repo.get(db, folder_id)  # ensure exists
    sub = await folders_repo.list_children(db, folder_id)
    files = await files_repo.list_in_folder(db, folder_id)
    return FolderListing(
        folders=[FolderOut.model_validate(f) for f in sub],
        files=[FileOut.model_validate(f) for f in files],
    )


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def create_folder(payload: FolderCreate, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    name = sanitize_name(payload.name)
    f = await folders_repo.create(db, payload.parent_id, name, user.id)
    await audit_repo.log(db, user_id=user.id, action="mkdir", entity_type="folder", entity_id=f.id, ip=_ip(request))
    return f


@router.patch("/{folder_id}", response_model=FolderOut, dependencies=[Depends(require_csrf)])
async def patch_folder(folder_id: int, payload: FolderPatch, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await folders_repo.get(db, folder_id)
    if payload.name is not None:
        await folders_repo.rename(db, f, sanitize_name(payload.name))
        await audit_repo.log(db, user_id=user.id, action="rename", entity_type="folder", entity_id=f.id, ip=_ip(request))
    if payload.parent_id is not None and payload.parent_id != f.parent_id:
        await folders_repo.move(db, f, payload.parent_id)
        await audit_repo.log(db, user_id=user.id, action="move", entity_type="folder", entity_id=f.id, ip=_ip(request))
    return f


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def delete_folder(folder_id: int, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await folders_repo.soft_delete_recursive(db, folder_id)
    await audit_repo.log(db, user_id=user.id, action="delete", entity_type="folder", entity_id=folder_id, ip=_ip(request))
    return None

