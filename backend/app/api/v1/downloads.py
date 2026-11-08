from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.db.session import get_db
from app.repositories import downloads as downloads_repo
from app.schemas import DownloadsOverview
from app.services import download_service

router = APIRouter()


@router.get("", response_model=DownloadsOverview)
async def list_downloads(
    user: CurrentUser,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    await downloads_repo.cleanup_stale(db)
    active = await downloads_repo.list_active(db)
    history = await downloads_repo.list_history(db, limit=limit)
    return DownloadsOverview(
        active=[download_service.to_item_out(d) for d in active],
        history=[download_service.to_item_out(d) for d in history],
    )
