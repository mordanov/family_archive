# Active Downloads & Download History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real-time active download tracking and download history stored in PostgreSQL and displayed on a dedicated `/downloads` page with a live indicator in the Topbar.

**Architecture:** A `downloads` PostgreSQL table records every direct and share-link file download. A streaming wrapper around S3 object streams creates an `'active'` record at start, flushes `bytes_sent` at throttled intervals (`0.5s` or `512 KB`), and finalizes the status (`'completed' | 'aborted' | 'error'`) when the stream closes. The frontend polls `GET /api/v1/downloads` to show real-time progress bars, speed, and download history on `/downloads`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (asyncpg), Alembic, React 18, TypeScript, TanStack Query, Tailwind CSS, i18next.

---

### Task 1: Define Backend Model, Migration, and Pydantic Contracts

**Files:**
- Create: `backend/alembic/versions/0002_downloads.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/__init__.py`

- [ ] **Step 1: Add `Download` ORM model to `backend/app/models/__init__.py`**

```python
class Download(Base):
    __tablename__ = "downloads"

    id: Mapped[uuid_lib.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid_lib.uuid4)
    file_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # 'direct' | 'share'
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    share_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("share_links.id", ondelete="SET NULL"), nullable=True
    )
    ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    total_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    bytes_sent: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("0"))
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'active'"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_downloads_status_updated", "status", text("updated_at DESC")),
        Index("ix_downloads_started_at", text("started_at DESC")),
    )
```

- [ ] **Step 2: Create Alembic migration `backend/alembic/versions/0002_downloads.py`**

```python
"""add downloads table

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "downloads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("share_id", sa.BigInteger(), sa.ForeignKey("share_links.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("total_bytes", sa.BigInteger(), nullable=False),
        sa.Column("bytes_sent", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("CREATE INDEX ix_downloads_status_updated ON downloads (status, updated_at DESC)")
    op.execute("CREATE INDEX ix_downloads_started_at ON downloads (started_at DESC)")


def downgrade() -> None:
    op.drop_table("downloads")
```

- [ ] **Step 3: Add `DownloadItemOut` and `DownloadsOverview` schemas to `backend/app/schemas/__init__.py`**

```python
# ---------- downloads ----------
class DownloadItemOut(BaseModel):
    id: uuid.UUID
    file_id: int | None
    filename: str
    source: Literal["direct", "share"]
    username: str | None = None
    share_id: int | None = None
    ip: str | None = None
    total_bytes: int
    bytes_sent: int
    progress_pct: float
    speed_bps: int
    status: Literal["active", "completed", "aborted", "error"]
    started_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None


class DownloadsOverview(BaseModel):
    active: list[DownloadItemOut]
    history: list[DownloadItemOut]
```

- [ ] **Step 4: Verify imports compile**

Run: `cd backend && .venv/bin/python -c "from app.models import Download; from app.schemas import DownloadItemOut, DownloadsOverview"`
Expected: exit code 0

---

### Task 2: Implement Download Repository, Streaming Tracker Service, and `/api/v1/downloads` Endpoint

**Files:**
- Create: `backend/app/repositories/downloads.py`
- Create: `backend/app/services/download_service.py`
- Create: `backend/app/api/v1/downloads.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/api/v1/files.py`
- Modify: `backend/app/api/v1/shares.py`
- Create: `backend/tests/test_downloads.py`

- [ ] **Step 1: Write `backend/tests/test_downloads.py`**

```python
HDR = {"X-Requested-With": "fetch"}


async def _upload(client, name: str, body: bytes):
    init = await client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": name, "size_bytes": len(body), "content_type": "text/plain"},
        headers=HDR,
    )
    up = init.json()["upload"]
    await client.put(
        f"/api/v1/uploads/{up['id']}/parts/1",
        content=body,
        headers={**HDR, "Content-Type": "application/octet-stream"},
    )
    return (await client.post(f"/api/v1/uploads/{up['id']}/complete", headers=HDR)).json()["file"]


async def test_direct_and_share_downloads_recorded(auth_client):
    f = await _upload(auth_client, "movie.bin", b"0123456789" * 100)

    dl = await auth_client.get(f"/api/v1/files/{f['id']}/download")
    assert dl.status_code == 200
    assert len(dl.content) == 1000

    sh = await auth_client.post("/api/v1/shares", json={"target_type": "file", "file_id": f["id"]}, headers=HDR)
    token = sh.json()["token"]
    sdl = await auth_client.get(f"/api/v1/shares/{token}/download")
    assert sdl.status_code == 200

    res = await auth_client.get("/api/v1/downloads")
    assert res.status_code == 200
    data = res.json()
    assert data["active"] == []
    sources = [h["source"] for h in data["history"] if h["filename"] == "movie.bin"]
    assert "direct" in sources and "share" in sources
    for h in data["history"]:
        if h["filename"] == "movie.bin":
            assert h["status"] == "completed"
            assert h["bytes_sent"] == 1000
            assert h["total_bytes"] == 1000
            assert h["progress_pct"] == 100.0
```

- [ ] **Step 2: Create `backend/app/repositories/downloads.py` and `backend/app/services/download_service.py`**

Implement DB operations (`create`, `update_progress`, `finish`, `cleanup_stale`, `list_active`, `list_history`) and the async stream wrapper `track_stream` that commits progress via `AsyncSessionLocal()` with `0.5s` / `512 KB` throttling.

- [ ] **Step 3: Wire `/api/v1/downloads`, `/api/v1/files/{id}/download`, and `/api/v1/shares/{token}/download`**

Register `downloads.router` under `/downloads` in `backend/app/api/v1/router.py` and wrap the download iterators in `files.py` and `shares.py`.

---

### Task 3: Frontend API Client, `/downloads` Page, Topbar Indicator, and Translations

**Files:**
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/api/downloads.ts`
- Create: `frontend/src/routes/DownloadsPage.tsx`
- Modify: `frontend/src/components/layout/Topbar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/ru.json`
- Create: `frontend/tests/downloads.test.ts`

- [ ] **Step 1: Add `DownloadItem` and `DownloadsOverview` types and `downloadsApi`**
- [ ] **Step 2: Add `/downloads` route and `DownloadsPage.tsx` with active progress bars + history table**
- [ ] **Step 3: Add `Download` icon link with active count badge in `Topbar.tsx` and translations in `en.json` / `ru.json`**
- [ ] **Step 4: Run `tsc -b`, `vitest run`, and `vite build` to verify**
