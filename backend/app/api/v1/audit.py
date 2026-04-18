from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.db.session import get_db
from app.repositories import audit as audit_repo
from app.schemas import AuditEntry

router = APIRouter()


@router.get("", response_model=list[AuditEntry])
async def recent(user: CurrentUser, limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    rows = await audit_repo.recent(db, limit=limit)
    return [AuditEntry.model_validate(r) for r in rows]

