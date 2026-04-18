from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.db.session import get_db
from app.repositories import files as files_repo
from app.services import zip_service

router = APIRouter()


@router.get("/{file_id}/zip/entries")
async def zip_entries(file_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await files_repo.get(db, file_id)
    return await zip_service.list_entries(f)


@router.get("/{file_id}/zip/entry")
async def zip_entry(file_id: int, user: CurrentUser, path: str = Query(...), db: AsyncSession = Depends(get_db)):
    f = await files_repo.get(db, file_id)
    payload, ctype = await zip_service.stream_entry(f, path)
    return Response(content=payload, media_type=ctype, headers={"X-Content-Type-Options": "nosniff"})

