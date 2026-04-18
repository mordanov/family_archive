from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.db.session import get_db
from app.schemas import FileOut, FolderOut
from app.services import trash_service

router = APIRouter()


def _ip(r: Request) -> str | None:
    return r.client.host if r.client else None


@router.get("")
async def list_trash(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    folders, files = await trash_service.list_trash(db)
    return {
        "folders": [FolderOut.model_validate(f) for f in folders],
        "files": [FileOut.model_validate(f) for f in files],
    }


@router.post("/files/{file_id}/restore", response_model=FileOut, dependencies=[Depends(require_csrf)])
async def restore_file(file_id: int, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await trash_service.restore_file(db, file_id, user.id, _ip(request))


@router.post("/folders/{folder_id}/restore", response_model=FolderOut, dependencies=[Depends(require_csrf)])
async def restore_folder(folder_id: int, request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await trash_service.restore_folder(db, folder_id, user.id, _ip(request))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def empty_trash(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await trash_service.purge_due(db)
    return None

