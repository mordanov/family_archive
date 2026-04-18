"""DB-backed sessions."""
from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.time import utcnow
from app.models import Session, User


async def create_session(
    db: AsyncSession, user_id: int, ip: str | None, user_agent: str | None
) -> Session:
    s = Session(
        id=uuid.uuid4(),
        user_id=user_id,
        expires_at=utcnow() + timedelta(days=settings.SESSION_LIFETIME_DAYS),
        ip=ip,
        user_agent=user_agent,
    )
    db.add(s)
    await db.flush()
    return s


async def load_session(db: AsyncSession, session_id: uuid.UUID) -> tuple[Session, User] | None:
    res = await db.execute(
        select(Session, User)
        .join(User, User.id == Session.user_id)
        .where(Session.id == session_id)
    )
    row = res.first()
    if not row:
        return None
    sess, user = row
    if sess.expires_at <= utcnow():
        await db.execute(delete(Session).where(Session.id == sess.id))
        return None
    return sess, user


async def touch_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    new_expiry = utcnow() + timedelta(days=settings.SESSION_LIFETIME_DAYS)
    await db.execute(
        update(Session)
        .where(Session.id == session_id)
        .values(last_seen_at=utcnow(), expires_at=new_expiry)
    )


async def delete_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    await db.execute(delete(Session).where(Session.id == session_id))


async def purge_expired_sessions(db: AsyncSession) -> int:
    res = await db.execute(delete(Session).where(Session.expires_at <= utcnow()))
    return res.rowcount or 0

