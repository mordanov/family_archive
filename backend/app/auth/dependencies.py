"""Auth dependencies: current user, CSRF guard."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.sessions import load_session, touch_session
from app.core.config import settings
from app.core.errors import Forbidden, Unauthorized
from app.db.session import get_db
from app.models import User


async def current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    raw = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not raw:
        raise Unauthorized("No session")
    try:
        sid = uuid.UUID(raw)
    except ValueError:
        raise Unauthorized("Bad session")
    loaded = await load_session(db, sid)
    if not loaded:
        raise Unauthorized("Session expired")
    sess, user = loaded
    await touch_session(db, sess.id)
    request.state.user = user
    request.state.session_id = sess.id
    return user


async def require_csrf(
    request: Request,
    x_requested_with: Annotated[str | None, Header(alias="X-Requested-With")] = None,
) -> None:
    """Enforce X-Requested-With header on state-changing requests; SameSite=Lax cookie covers the rest."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    if x_requested_with != "fetch":
        raise Forbidden("Missing CSRF header")


CurrentUser = Annotated[User, Depends(current_user)]


