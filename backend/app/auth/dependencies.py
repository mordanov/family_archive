"""Auth dependencies — centralised auth service via JWT Bearer."""
from __future__ import annotations

import os
from typing import Annotated

from fastapi import Depends, Request

from auth_client import AuthenticatedUser, get_auth_dependency

_verify = get_auth_dependency(
    app_name=os.environ.get("AUTH_APP_NAME", "family-archive"),
    jwks_url=os.environ.get("AUTH_SERVICE_URL", "http://localhost:8000") + "/.well-known/jwks.json",
)

current_user = _verify


async def require_csrf(request: Request) -> None:
    """No-op: CSRF protection is not needed with JWT Bearer auth."""
    pass


CurrentUser = Annotated[AuthenticatedUser, Depends(_verify)]
