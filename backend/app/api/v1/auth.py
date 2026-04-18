from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_csrf
from app.core.config import settings
from app.db.session import get_db
from app.schemas import LoginRequest, UserOut
from app.services import auth_service
from app.utils.ratelimit import RateLimiter

router = APIRouter()
_login_limiter = RateLimiter(settings.MAX_LOGIN_ATTEMPTS_PER_15MIN, 15 * 60)


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    _login_limiter.check(f"login:{ip}")
    user, sess = await auth_service.login(db, payload.username, payload.password, ip, request.headers.get("user-agent"))
    resp = Response(status_code=204)
    resp.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=str(sess.id),
        max_age=settings.SESSION_LIFETIME_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        domain=settings.COOKIE_DOMAIN or None,
        path="/",
    )
    return resp


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
async def logout(request: Request, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    sid = getattr(request.state, "session_id", None)
    if sid is not None:
        await auth_service.logout(db, sid, user.id, _client_ip(request))
    resp = Response(status_code=204)
    resp.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
    return resp


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user

