# Active Downloads & Download History Design

## Goal
Provide authenticated users with a dedicated `/downloads` page and topbar indicator showing all active file downloads in real time (both direct authenticated downloads and public share-link downloads) as well as historical downloads stored in PostgreSQL.

## Architecture & Data Model

### 1. Database Table (`downloads`)
A new Alembic migration (`0002_downloads.py`) creates the `downloads` table:
- `id`: `UUID` (primary key, default `uuid4`)
- `file_id`: `BigInteger` (`ForeignKey("files.id", ondelete="SET NULL")`, nullable)
- `filename`: `String(255)` (not null — snapshot of the file name at download start so history remains readable if the file is later renamed or deleted)
- `source`: `String(16)` (not null — `'direct'` or `'share'`)
- `user_id`: `BigInteger` (`ForeignKey("users.id", ondelete="SET NULL")`, nullable)
- `username`: `String(255)` (nullable — snapshot of username for direct downloads)
- `share_id`: `BigInteger` (`ForeignKey("share_links.id", ondelete="SET NULL")`, nullable)
- `ip`: `INET` (nullable)
- `total_bytes`: `BigInteger` (not null — expected byte length of the full file or requested HTTP `Range`)
- `bytes_sent`: `BigInteger` (not null, default `0`)
- `status`: `String(16)` (not null, default `'active'` — `'active' | 'completed' | 'aborted' | 'error'`)
- `started_at`: `DateTime(timezone=True)` (not null, `server_default=func.now()`)
- `updated_at`: `DateTime(timezone=True)` (not null, `server_default=func.now()`)
- `finished_at`: `DateTime(timezone=True)` (nullable)

Indexes:
- `ix_downloads_status_updated` on `(status, updated_at DESC)`
- `ix_downloads_started_at` on `(started_at DESC)`

### 2. Streaming Wrapper & Throttled Progress Updates
All file download streams (`GET /api/v1/files/{file_id}/download` and `GET /api/v1/shares/{token}/download`) wrap the S3 chunk iterator via `download_service.track_stream(...)`:
1. Before returning `StreamingResponse`, a row is inserted into `downloads` with `status='active'` and committed immediately using an independent `AsyncSessionLocal()` session so concurrent `GET /api/v1/downloads` calls see the active download right away.
2. As chunks are yielded to the client, `bytes_sent` is accumulated in memory and persisted to PostgreSQL whenever at least `0.5s` has elapsed or `512 KB` has been sent since the last flush.
3. If an exception occurs while streaming, `status` is set to `'error'`.
4. In the generator `finally` block, a final DB update sets `bytes_sent`, `updated_at = now()`, `finished_at = now()`, and `status = 'completed'` if `bytes_sent >= total_bytes` (or if `total_bytes == 0`), otherwise `'aborted'` (e.g., client disconnected early).
5. Stale active cleanup: when querying downloads, any record with `status = 'active'` and `updated_at < now() - interval '60 seconds'` is automatically marked as `status = 'aborted', finished_at = updated_at` to handle unexpected process restarts.

### 3. Backend API (`GET /api/v1/downloads`)
- Route: `GET /api/v1/downloads?limit=100` (requires `CurrentUser`).
- Response schema `DownloadsOverview`:
  - `active`: `list[DownloadItemOut]` (ordered by `started_at DESC`)
  - `history`: `list[DownloadItemOut]` (non-active records ordered by `started_at DESC`, limited by `limit`)
- `DownloadItemOut` fields:
  - `id`: `UUID`
  - `file_id`: `int | None`
  - `filename`: `str`
  - `source`: `'direct' | 'share'`
  - `username`: `str | None`
  - `share_id`: `int | None`
  - `ip`: `str | None`
  - `total_bytes`: `int`
  - `bytes_sent`: `int`
  - `progress_pct`: `float` (`0.0`–`100.0`)
  - `speed_bps`: ` int` (computed from `bytes_sent / max(elapsed_seconds, 0.1)` while active, `0` when finished)
  - `status`: `'active' | 'completed' | 'aborted' | 'error'`
  - `started_at`: `datetime`
  - `updated_at`: `datetime`
  - `finished_at`: `datetime | None`

### 4. Frontend (`/downloads` & Topbar)
- **Topbar (`src/components/layout/Topbar.tsx`)**:
  - Adds a link to `/downloads` next to `/trash` with a `Download` icon and a live badge showing `active.length` when `> 0`.
- **Page (`src/routes/DownloadsPage.tsx`)**:
  - Polls `GET /api/v1/downloads` every `1500ms` via React Query.
  - **Active Downloads section**: displays each active download with filename, source badge (User or Share link + IP), transferred / total bytes, speed (`formatBytes(speed_bps) + '/s'`), percentage, and a smooth progress bar.
  - **Download History section**: table of past downloads showing filename, source (username or share), IP, transferred / total size, status badge (`Completed`, `Aborted`, `Error`), and timestamp.
- **Localization (`en.json`, `ru.json`)**:
  - Full English and Russian translations for all labels and statuses.

## Testing Strategy
- Backend integration test (`tests/test_downloads.py`): verifies that downloading a file via `/files/{id}/download` and `/shares/{token}/download` records entries in `/api/v1/downloads`, and verifies active-state tracking during chunk iteration as well as stale-download cleanup.
- Frontend unit/build verification (`tsc -b`, `vitest run`, `vite build`).
