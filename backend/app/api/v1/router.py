"""Aggregated v1 router."""
from fastapi import APIRouter

from app.api.v1 import (
    audit,
    auth,
    files,
    folders,
    health,
    previews,
    shares,
    tags,
    trash,
    uploads,
    zip as zip_router,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(folders.router, prefix="/folders", tags=["folders"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(previews.router, prefix="/files", tags=["previews"])
api_router.include_router(zip_router.router, prefix="/files", tags=["zip"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(shares.router, prefix="/shares", tags=["shares"])
api_router.include_router(trash.router, prefix="/trash", tags=["trash"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])

