"""Auth dependencies — migrated to centralised auth service.

Session-cookie auth (itsdangerous) is replaced by RS256 JWT validated
by AuthMiddleware.  CSRF protection is no longer needed because JWT is
sent as an Authorization: Bearer header, not as a cookie that the browser
auto-submits on cross-origin requests.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from auth_client import AuthenticatedUser


async def current_user(request: Request) -> AuthenticatedUser:
    """Return the authenticated user injected by AuthMiddleware.

    AuthMiddleware validates the RS256 JWT and populates request.state.user.
    Returns AuthenticatedUser with .sub (UUID str) and .grants (list[str]).
    """
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return user


async def require_csrf(request: Request) -> None:
    """No-op: CSRF protection is not needed with JWT Bearer auth."""
    pass


CurrentUser = Annotated[AuthenticatedUser, Depends(current_user)]
