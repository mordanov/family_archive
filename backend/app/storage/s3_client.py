"""Lazy aiobotocore S3 client factory.

A single AioSession is reused for the process lifetime; per-request clients are
created via async context manager (cheap; clients are coroutine-safe to create).
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from aiobotocore.session import AioSession, get_session
from botocore.config import Config

from app.core.config import settings

_session: AioSession | None = None


def _get_session() -> AioSession:
    global _session
    if _session is None:
        _session = get_session()
    return _session


@asynccontextmanager
async def s3_client() -> AsyncIterator:
    sess = _get_session()
    cfg = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path" if settings.S3_FORCE_PATH_STYLE else "virtual"},
        retries={"max_attempts": 4, "mode": "standard"},
        connect_timeout=10,
        read_timeout=120,
    )
    async with sess.create_client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=cfg,
    ) as client:
        yield client

