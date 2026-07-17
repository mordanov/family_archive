from __future__ import annotations

import secrets
import uuid as uuid_lib
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models import Session


def _make_token() -> str:
    return secrets.token_urlsafe(32)


async def create(db: AsyncSession, *, user_id: int, ttl_seconds: int, ip: str | None) -> Session:
    now = utcnow()
    s = Session(
        id=uuid_lib.uuid4(),
        user_id=user_id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds),
        ip=ip,
    )
    db.add(s)
    await db.flush()
    return s


async def get_valid(db: AsyncSession, session_id: uuid_lib.UUID) -> Session | None:
    res = await db.execute(
        select(Session).where(Session.id == session_id, Session.expires_at > utcnow())
    )
    return res.scalar_one_or_none()


async def delete(db: AsyncSession, session_id: uuid_lib.UUID) -> None:
    s = await db.get(Session, session_id)
    if s:
        await db.delete(s)
