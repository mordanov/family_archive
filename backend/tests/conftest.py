"""Pytest fixtures: ephemeral Postgres + moto-mocked S3 + httpx AsyncClient."""
from __future__ import annotations

import os
import asyncio
import uuid as uuid_lib

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer

# Configure environment BEFORE importing app
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:5000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "family-archive-test")
os.environ.setdefault("S3_REGION", "us-east-1")
os.environ.setdefault("COOKIE_SECURE", "0")
os.environ.setdefault("ARCHIVE_USER1_USERNAME", "tester")
os.environ.setdefault("ARCHIVE_USER1_PASSWORD", "testpass")
os.environ.setdefault("ARCHIVE_USER2_USERNAME", "")
os.environ.setdefault("ARCHIVE_USER2_PASSWORD", "")
os.environ.setdefault("MAX_LOGIN_ATTEMPTS_PER_15MIN", "1000")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest_asyncio.fixture(scope="session")
async def setup_db(postgres_container):
    url = postgres_container.get_connection_url().replace("psycopg2", "asyncpg").replace("postgresql+psycopg2", "postgresql+asyncpg")
    if "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://")
    os.environ["DATABASE_URL"] = url

    # rebuild settings & engine after env mutation
    from app.core import config as cfg
    cfg.settings = cfg.Settings()
    from app.db import session as ses
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    ses.engine = create_async_engine(cfg.settings.DATABASE_URL)
    ses.AsyncSessionLocal = async_sessionmaker(ses.engine, expire_on_commit=False, class_=AsyncSession)

    from alembic import command
    from alembic.config import Config
    cfg_alembic = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg_alembic.set_main_option("sqlalchemy.url", cfg.settings.DATABASE_URL)
    cfg_alembic.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    await asyncio.get_running_loop().run_in_executor(None, lambda: command.upgrade(cfg_alembic, "head"))

    yield


@pytest_asyncio.fixture
async def s3_mock():
    """Spin up moto S3 server in-process and create the test bucket."""
    import app.storage.s3_client as s3_mod
    s3_mod._session = None  # discard stale connections from previous test's server
    from moto.server import ThreadedMotoServer
    server = ThreadedMotoServer(port=5000, verbose=False)
    server.start()
    try:
        from app.storage.object_store import object_store
        from app.storage.s3_client import s3_client
        async with s3_client() as c:
            try:
                await c.create_bucket(Bucket=object_store.bucket)
            except Exception:
                pass
        yield
    finally:
        server.stop()
        s3_mod._session = None


@pytest_asyncio.fixture
async def client(setup_db, s3_mock):
    from app.main import app
    from app.db.session import AsyncSessionLocal
    from app.services.bootstrap import ensure_default_users
    async with AsyncSessionLocal() as db:
        await ensure_default_users(db)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "testpass"},
        headers={"X-Requested-With": "fetch"},
    )
    assert r.status_code == 204, r.text
    yield client

