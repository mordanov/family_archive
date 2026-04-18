from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.db.session import get_db
from app.repositories import tags as tags_repo
from app.schemas import TagCreate, TagOut

router = APIRouter()


@router.get("", response_model=list[TagOut])
async def list_tags(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await tags_repo.list_all(db)


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def create_tag(payload: TagCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await tags_repo.get_or_create(db, payload.name, payload.color)


@router.delete("/{tag_id}", status_code=204, dependencies=[Depends(require_csrf)])
async def delete_tag(tag_id: int, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    t = await tags_repo.get(db, tag_id)
    await tags_repo.delete(db, t)
    return None

