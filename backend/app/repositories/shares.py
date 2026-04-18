from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.core.time import utcnow
from app.models import ShareLink


def make_token() -> str:
    return secrets.token_urlsafe(32)


async def create(db: AsyncSession, **fields) -> ShareLink:
    s = ShareLink(token=make_token(), **fields)
    db.add(s)
    await db.flush()
    return s


async def get_by_token(db: AsyncSession, token: str) -> ShareLink:
    res = await db.execute(
        select(ShareLink).where(ShareLink.token == token, ShareLink.revoked_at.is_(None))
    )
    s = res.scalar_one_or_none()
    if not s:
        raise NotFound("Share not found")
    if s.expires_at and s.expires_at <= utcnow():
        raise NotFound("Share expired")
    if s.max_downloads is not None and s.download_count >= s.max_downloads:
        raise NotFound("Share exhausted")
    return s


async def get(db: AsyncSession, share_id: int) -> ShareLink:
    s = await db.get(ShareLink, share_id)
    if not s:
        raise NotFound("Share not found")
    return s


async def list_active(db: AsyncSession) -> list[ShareLink]:
    res = await db.execute(
        select(ShareLink).where(ShareLink.revoked_at.is_(None)).order_by(ShareLink.created_at.desc())
    )
    return list(res.scalars())


async def revoke(db: AsyncSession, s: ShareLink) -> None:
    s.revoked_at = utcnow()


async def increment_download(db: AsyncSession, s: ShareLink) -> None:
    s.download_count += 1

