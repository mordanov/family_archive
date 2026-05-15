"""Auth endpoints — migrated to centralised auth service.

Login and logout are handled by the standalone auth service.
JWT validation happens in AuthMiddleware (see main.py).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import CurrentUser
from auth_client import AuthenticatedUser

router = APIRouter()


@router.get("/me")
async def me(user: CurrentUser):
    # TODO(data-migration): return full user profile once auth_service_user_id is mapped
    return {"sub": user.sub, "grants": user.grants}
