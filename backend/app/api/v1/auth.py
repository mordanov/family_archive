from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.auth.password import verify_password
from app.core.config import settings
from app.db.session import get_db
from app.repositories import sessions as sessions_repo
from app.repositories import users as users_repo
from app.utils.ratelimit import RateLimiter

router = APIRouter()

_login_limiter = RateLimiter(settings.MAX_LOGIN_ATTEMPTS_PER_15MIN, 900)


def _ip(r: Request) -> str | None:
    return r.client.host if r.client else None


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def login(payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    _login_limiter.check(f"login:{_ip(request)}")
    user = await users_repo.get_by_username(db, payload.username)
    if not user or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    session = await sessions_repo.create(db, user_id=user.id, ttl_seconds=settings.SESSION_TTL_SECONDS, ip=_ip(request))
    await db.commit()
    response.set_cookie(
        "session_id",
        str(session.id),
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.SESSION_TTL_SECONDS,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    import uuid as uuid_lib
    raw = request.cookies.get("session_id")
    if raw:
        try:
            await sessions_repo.delete(db, uuid_lib.UUID(raw))
            await db.commit()
        except Exception:
            pass
    response.delete_cookie("session_id")


@router.get("/me")
async def me(user: CurrentUser):
    return {"id": user.id, "username": user.username}
