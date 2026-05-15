from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os

from app.api.v1.router import api_router
from app.core.config import settings
from app.logging_conf import configure_logging
from app.workers.manager import manager as workers

configure_logging()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # TODO(data-migration): ensure_default_users removed — user bootstrap handled by auth service
    await workers.start()
    try:
        yield
    finally:
        await workers.stop()


app = FastAPI(title="Family Archive API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Centralised auth service middleware — validates RS256 JWT on every request
from auth_client import AuthMiddleware
app.add_middleware(
    AuthMiddleware,
    app_name=os.environ.get("AUTH_APP_NAME", "family-archive"),
    jwks_url=os.environ.get("AUTH_SERVICE_URL", "http://localhost:8000") + "/.well-known/jwks.json",
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def root_health():
    return {"status": "ok"}

