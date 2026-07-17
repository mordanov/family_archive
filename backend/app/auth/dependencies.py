"""Auth dependencies — session cookie based."""
from __future__ import annotations

import uuid as uuid_lib
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.db.session import get_db
from app.models import User
from app.repositories import sessions as sessions_repo
from app.repositories import users as users_repo
from sqlalchemy.ext.asyncio import AsyncSession


async def require_csrf(request: Request) -> None:
    if request.headers.get("X-Requested-With") != "fetch":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF check failed")


async def _get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    raw = request.cookies.get("session_id")
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        session_id = uuid_lib.UUID(raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    session = await sessions_repo.get_valid(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = await users_repo.get_by_id(db, session.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


CurrentUser = Annotated[User, Depends(_get_current_user)]
