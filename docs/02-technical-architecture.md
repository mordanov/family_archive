# Family Archive — Technical Architecture

> Companion to the source code. Reflects what is actually shipped in v1.

## 1. High-level diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                                Browser                                 │
│  React 18 + Vite SPA  •  TanStack Query  •  Zustand  •  IndexedDB      │
└──────────────────┬───────────────────────────────────┬─────────────────┘
                   │ HTTPS, HttpOnly session cookie    │ HTTPS
                   │ X-Requested-With: fetch (CSRF)    │ public share
                   │                                   │ (no cookie)
                   ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                Shared Nginx (web-folders/nginx)                        │
│  TLS termination • per-site routing by Host header • Let's Encrypt     │
│  archive-https.conf.template:                                          │
│    client_max_body_size 32m, proxy_buffering off,                      │
│    proxy_request_buffering off, proxy_read_timeout 600s                │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │ /api/*                        │ /
                   ▼                               ▼
        ┌───────────────────────┐       ┌──────────────────────┐
        │  archive-backend      │       │  archive-frontend    │
        │  FastAPI / asyncio    │       │  nginx serving       │
        │  uvicorn (proxy hdrs) │       │  vite-built bundle   │
        └────────┬────────┬─────┘       └──────────────────────┘
                 │        │
                 │        │ in-process workers:
                 │        │   - thumbnail queue
                 │        │   - trash purge   (every 6 h)
                 │        │   - multipart GC  (every 1 h)
                 ▼        ▼
   ┌─────────────────────────────┐    ┌────────────────────────────────┐
    │  PostgreSQL 16 (shared)     │    │  Hetzner Object Storage (S3)   │
    │  database `archive`         │    │  bucket: family-archive        │
    │  - users, sessions          │    │  ├ uploads/   (in flight)      │
    │  - folders, files, tags     │    │  ├ files/<uuid>/<safe-name>    │
    │  - uploads, upload_parts    │    │  ├ thumbnails/<uuid>/{256,1024}│
    │  - share_links              │    │  ├ posters/<uuid>.jpg          │
    │  - audit_log                │    │  ├ deleted/<id>/...            │
    │                             │    │  └ admin-routine/backups/*.zip │
    │                             │    │     (reserved for              │
    │                             │    │      family-admin-routine)     │
    └─────────────────────────────┘    └────────────────────────────────┘
```

## 2. Component breakdown

### 2.1 Backend (`backend/app/`)
Layered, no global state outside the FastAPI app.

| Layer | Folder | Responsibility |
|---|---|---|
| HTTP | `api/v1/` | Routers, request/response shapes, dependency wiring. No business logic. |
| Services | `services/` | Business logic. The only layer allowed to mix repositories + storage. |
| Repositories | `repositories/` | Pure SQLAlchemy queries. Take `AsyncSession`, return ORM rows. |
| Storage | `storage/` | The single S3 abstraction (`ObjectStore`). Only file in the codebase that imports `aiobotocore`. |
| Auth | `auth/` | Argon2id password hashing, DB-backed session lifecycle, FastAPI dependencies. |
| Media | `media/` | Pillow / ffmpeg / mutagen helpers used by the preview service. |
| Workers | `workers/` | Long-running async loops launched in the FastAPI lifespan. |
| Models | `models/` | SQLAlchemy declarative models (single source of schema truth). |
| Schemas | `schemas/` | Pydantic v2 DTOs (one place for HTTP contracts). |
| Core | `core/` | Settings (`pydantic-settings`), shared error hierarchy, time helpers. |
| Utils | `utils/` | Small pure helpers: filename sanitization, Range header parser, in-memory rate limiter. |

Layering rule (enforced by review, not by code):
**API → Services → (Repositories | Storage)**. API never imports a repository.
Repositories never import Storage. Services are the only crossroad.

### 2.2 Frontend (`frontend/src/`)

| Layer | Folder | Notes |
|---|---|---|
| API client | `api/` | Tiny `fetch` wrapper that injects `X-Requested-With: fetch` on mutations and `credentials: 'include'` always. |
| State (server) | `hooks/` + TanStack Query | Folder/file caches keyed by folder id. `staleTime: 30s`. |
| State (client) | `stores/` (Zustand) | `uiStore`, `selectionStore`, `uploadStore`. The upload store is the only stateful machine of any size. |
| Persistence | `lib/idb.ts` (IndexedDB) | Persists in-flight upload metadata so a page reload preserves the queue. |
| Routes | `routes/` | `LoginPage`, `BrowserPage`, `TrashPage`, `SharePage`, `NotFoundPage`. |
| Layout | `components/layout/` | Topbar, Sidebar (folder tree), Breadcrumbs, AppShell. |
| Browser | `components/browser/` | FileList + FileRow with hover actions. |
| Upload | `components/upload/` | DropZone + UploadQueue (bottom-right, persistent). |
| Preview | `components/preview/` | One component per kind: Image / Video / Audio / Zip. |
| Dialogs | `components/dialogs/` | Modal primitive + NewFolder / Rename / Share / Confirm. |

### 2.3 Storage interaction layer (`backend/app/storage/`)
Two small files:
- `s3_client.py` — async context manager that yields an `aiobotocore` client
  bound to the configured endpoint, region, and path-style flag.
- `object_store.py` — `ObjectStore` class with the entire S3 surface the app uses:
  `put_object`, `get_object_stream`, `get_range_bytes`, `head_object`,
  `delete_object`, `copy_object`, `create_multipart`, `upload_part`,
  `list_parts`, `complete_multipart`, `abort_multipart`. **All other code uses
  these and only these.**

This is the single seam to swap to a different provider (MinIO, AWS, R2, etc.).

## 3. Data flow

### 3.1 Upload (resumable, chunked)
```
Browser                        Backend                       Postgres                  S3
   │                              │                              │                       │
   │ POST /uploads {folder, name, size, type}                                            │
   ├─────────────────────────────►│                                                      │
   │                              │ INSERT uploads (status=init)                         │
   │                              ├─────────────────────────────►│                       │
   │                              │ CreateMultipartUpload                                │
   │                              ├──────────────────────────────────────────────────────►
   │                              │◄────────── upload_id ─────────────────────────────────
   │                              │ UPDATE uploads SET s3_upload_id, status=uploading    │
   │                              ├─────────────────────────────►│                       │
   │◄──── 201 {id, chunk_size, total_parts, parts:[]} ────────────                       │
   │                              │                                                      │
   │ for n=1..N (parallelism=1 by default):                                              │
   │ PUT /uploads/{id}/parts/{n}  body=8MB chunk                                         │
   ├─────────────────────────────►│                                                      │
   │                              │ UploadPart (raw bytes streamed)                      │
   │                              ├──────────────────────────────────────────────────────►
   │                              │◄─────────── ETag ─────────────────────────────────────
   │                              │ INSERT upload_parts (n, etag, size)                  │
   │                              ├─────────────────────────────►│                       │
   │◄──── {part_number, etag, size}                                                      │
   │                              │                                                      │
   │ POST /uploads/{id}/complete                                                         │
   ├─────────────────────────────►│                                                      │
   │                              │ SELECT parts ORDER BY n                              │
   │                              ├─────────────────────────────►│                       │
   │                              │ CompleteMultipartUpload(parts)                       │
   │                              ├──────────────────────────────────────────────────────►
   │                              │ INSERT files; UPDATE uploads SET status=completed    │
   │                              ├─────────────────────────────►│                       │
   │                              │ enqueue thumbnail job                                │
   │◄──── 200 {file: {id, ...}} ─                                                        │
```

**Resume after browser reload**: the browser persists `{upload_id, receivedParts}`
to IndexedDB. On reload, `useUploads.hydrateUploadsFromIDB()` rebuilds the queue
in `paused` state. When the user re-picks the file, the client calls
`GET /uploads/{id}` to reconcile against the server's authoritative `parts`
list and resends only what is missing.

**Resume after server restart**: state lives in Postgres + S3, never in process
memory. The reconcile step works identically.

**GC of forgotten uploads**: a worker scans `uploads WHERE status='uploading'
AND created_at < now() - 24 h` every hour and aborts them server-side
(`AbortMultipartUpload`).

### 3.2 Download
```
GET /files/{id}/download    [+ optional Range: bytes=a-b]
   ↓
Service: load File row from DB → fetch from S3 via ObjectStore.get_object_stream(key, range)
   ↓
StreamingResponse(iterator, status=206|200, headers: Content-Range, Accept-Ranges,
                  Content-Disposition, Content-Type, X-Content-Type-Options=nosniff)
```
- Bytes flow **straight through** the backend; nginx is configured with
  `proxy_buffering off`, so the browser starts receiving data immediately.
- Range requests are passed through to S3, enabling video scrubbing and
  resumable downloads with no extra logic.

### 3.3 Preview
- **Image** thumbnails are generated inline (≤50 MB) or queued (otherwise) by
  the thumbnail worker, stored at `thumbnails/<uuid>/256.webp` and
  `thumbnails/<uuid>/1024.webp`. Endpoint: `GET /files/{id}/thumbnail?size=256`,
  long-cached (`Cache-Control: public, max-age=604800, immutable`).
- **Video poster** is a single ffmpeg seek+grab to `posters/<uuid>.jpg`, served
  from `GET /files/{id}/poster`.
- **Audio metadata** (duration, bitrate, ID3 tags) is extracted with `mutagen`,
  stored in `files.audio_meta` (JSONB) for cheap retrieval.
- **ZIP browsing** is a custom implementation in `services/zip_service.py`:
  1. Range-read the last ~64 KB of the object to find the End-of-Central-Directory record.
  2. Range-read the central directory to enumerate entries.
  3. For a single-entry preview, range-read the local file header + payload
     and decompress in memory (cap: 100 MB).

  No full extraction, no temp files.

### 3.4 Share link (public download)
```
GET /shares/{token}                  → public meta (and password requirement)
POST /shares/{token}/unlock          → verify password (rate-limited 10/min/IP/token)
GET /shares/{token}/download         → if file: range-aware stream, increments counter,
                                       writes audit log. Refuses past expiry / cap / revoke.
```
Cookies are **not** sent to share endpoints; the browser code uses an absolute
URL pointing to the same origin without sending the session cookie isn't enforced —
public endpoints simply don't read the cookie. Authentication is the share token
(plus optional password), not the family-user session.

## 4. Database schema

PostgreSQL 16. All tables in the `archive` database. SQLAlchemy ORM is the
source of truth; Alembic generates migrations.

```
users                                         sessions
─────                                         ────────
id            BIGSERIAL PK                    id            UUID PK
username      CITEXT UNIQUE                   user_id       BIGINT FK→users(id) ON DELETE CASCADE
password_hash TEXT                            ip            INET
created_at    TIMESTAMPTZ                     user_agent    TEXT
                                              created_at    TIMESTAMPTZ
                                              last_seen_at  TIMESTAMPTZ
                                              expires_at    TIMESTAMPTZ
                                              IDX (user_id), IDX (expires_at)


folders                                       files
───────                                       ─────
id            BIGSERIAL PK                    id              BIGSERIAL PK
parent_id     BIGINT FK→folders(id)           uuid            UUID UNIQUE  (S3 path component)
              ON DELETE RESTRICT              folder_id       BIGINT FK→folders(id) ON DELETE RESTRICT
name          TEXT                            name            TEXT
created_at    TIMESTAMPTZ                     size_bytes      BIGINT
updated_at    TIMESTAMPTZ                     content_type    TEXT
deleted_at    TIMESTAMPTZ NULL                s3_key          TEXT UNIQUE
created_by    BIGINT FK→users(id)             content_sha256  TEXT NULL  (post-completion)
                                              has_thumbnail   BOOLEAN
UNIQUE(parent_id, lower(name)) WHERE          has_poster      BOOLEAN
       deleted_at IS NULL                     audio_meta      JSONB NULL
                                              created_at      TIMESTAMPTZ
Folder #1 (id=1, parent=NULL, name='')        updated_at      TIMESTAMPTZ
is the immutable root.                        deleted_at      TIMESTAMPTZ NULL
                                              created_by      BIGINT FK→users(id)
                                              UNIQUE(folder_id, lower(name))
                                                     WHERE deleted_at IS NULL
                                              IDX (folder_id, deleted_at)


tags                       file_tags                     uploads
────                       ─────────                     ───────
id    BIGSERIAL PK         file_id BIGINT FK             id            UUID PK
name  CITEXT UNIQUE        tag_id  BIGINT FK             user_id       BIGINT FK→users
color TEXT NULL            PK(file_id, tag_id)           folder_id     BIGINT FK→folders
                           ON DELETE CASCADE both        filename      TEXT
                                                         size_bytes    BIGINT
                                                         content_type  TEXT
                                                         chunk_size    INT
                                                         total_parts   INT
                                                         s3_key        TEXT
                                                         s3_upload_id  TEXT
                                                         status        TEXT  CHECK in (init,uploading,completed,aborted)
                                                         created_at    TIMESTAMPTZ
                                                         updated_at    TIMESTAMPTZ
                                                         IDX (status, created_at)


upload_parts                              share_links
────────────                              ───────────
id            BIGSERIAL PK                id             BIGSERIAL PK
upload_id     UUID FK→uploads             token          TEXT UNIQUE  (URL-safe random)
              ON DELETE CASCADE           target_type    TEXT CHECK in (file, folder)
part_number   INT                         file_id        BIGINT FK→files NULL
size_bytes    BIGINT                      folder_id      BIGINT FK→folders NULL
etag          TEXT                        password_hash  TEXT NULL
created_at    TIMESTAMPTZ                 expires_at     TIMESTAMPTZ NULL
UNIQUE(upload_id, part_number)            max_downloads  INT NULL
                                          download_count INT
                                          revoked_at     TIMESTAMPTZ NULL
                                          created_at     TIMESTAMPTZ
                                          created_by     BIGINT FK→users
                                          CHECK (file_id IS NOT NULL XOR folder_id IS NOT NULL)


audit_log
─────────
id            BIGSERIAL PK
user_id       BIGINT FK→users NULL          (NULL = public/share action)
action        TEXT      (login, logout, mkdir, rename, move, delete, restore,
                         upload, download, share_create, share_revoke, share_download)
entity_type   TEXT NULL (file|folder|share|user)
entity_id     BIGINT NULL
extra_data    JSONB NULL
ip            INET NULL
created_at    TIMESTAMPTZ
IDX (created_at DESC), IDX (user_id, created_at DESC)
```

Notes:
- `CITEXT` columns + `lower(name)` partial-unique indexes give
  case-insensitive uniqueness while keeping the original casing.
- Soft delete: `deleted_at IS NOT NULL` excludes a row from listings; the
  trash purge worker physically deletes rows + S3 objects after the retention
  window (30 days by default).
- All foreign keys cascade in the safe direction: deleting a folder restricts
  unless its files are deleted first; deleting a user is not a normal v1
  operation but cascades sessions for cleanup.

## 5. Key technical decisions and trade-offs

| Decision | Why | Alternative considered |
|---|---|---|
| **All bytes through the backend** (no presigned URLs) | Single auth surface, single audit point, share links can do password / expiry / counter without trusting the storage provider. | Presigned URLs would offload bandwidth from the VPS; rejected because v1 traffic is small and code complexity drops a lot by avoiding two auth models. |
| **DB-backed sessions** + HttpOnly Secure cookie | Trivial revocation, server-side `last_seen_at`, sliding 30-day expiry. | JWTs would need a denylist anyway for logout/revoke; rejected as net-zero benefit for 2 users. |
| **CSRF via `X-Requested-With: fetch`** plus `SameSite=Lax` cookie | Simple, no token endpoint, no double-submit cookie dance. Works with our SPA. | Synchronizer-token CSRF: more code, no real win for a same-origin SPA. |
| **Argon2id (`argon2-cffi`)** | Modern KDF, side-channel resistant, simple library. | bcrypt: also fine; chose argon2id for parameter clarity. |
| **PostgreSQL only** (no Redis) | One stateful service to operate. Sessions and queues live in PG; the rate limiter is in-process and per-instance (acceptable for 2 users). | Redis: rejected; would add an SPOF and ops surface. |
| **In-process workers** | One container, simple deploy. The worker code is structured so it can be extracted to a separate `archive-worker` container by adding 5 lines of code if traffic ever justifies it. | Separate worker container from day 1: rejected as premature for 2 users. |
| **Chunk size = 8 MB** | Balances S3 multipart minimum (5 MB), nginx buffer behavior, and resume granularity over flaky cellular networks. | 16 MB / 32 MB: less granular resume; rejected. |
| **ZIP browsing in pure Python** with range reads | No need to download the whole archive to peek at it; works on multi-GB ZIPs. | Server-side full extraction: rejected; would defeat the purpose. |
| **No own thumbnailing pipeline service**; Pillow + ffmpeg in the API container | One image, one place to debug. Fine for our load. | Separate worker w/ message queue: premature. |
| **Trash retention = 30 days** | User-facing answer to "I deleted by accident". Small storage overhead. | 7 days (too risky), 90 days (storage cost). |
| **Single S3 bucket, prefix-based namespacing** | Simpler IAM, one place to back up. | Multiple buckets per prefix: not worth it for v1. |
| **React + TanStack Query + Zustand** | Modern, light, no Redux boilerplate. Server cache is one tool, client state another, neither used for the other's job. | Next.js: too much for an internal SPA. |
| **No CDN in v1** | Hetzner egress is cheap and the audience is two people + occasional grandparent download. Same-origin static assets get long-cache headers. | Cloudflare in front: easy to add later; revisit when share-link traffic grows. |

## 6. Security considerations

| Concern | Mitigation |
|---|---|
| Credential theft | Argon2id with high memory cost; passwords seeded from env, never logged. |
| Session theft | HttpOnly + Secure + SameSite=Lax cookie; sessions stored server-side and revocable; sliding expiry caps replay window. |
| CSRF | `SameSite=Lax` cookie + custom header check on every mutation. |
| Brute force login | In-memory leaky-bucket limiter: 5 attempts / 15 min / IP. |
| Brute force share password | Same limiter: 10 attempts / min / (IP, token). |
| Path traversal in filenames | `sanitize_name()` strips path separators, control chars, leading dots, zero-width chars; rejects empty results. |
| Direct S3 access | Bucket is private; no presigned URLs are ever issued; the backend is the only entity holding S3 credentials. |
| MIME confusion / XSS via uploaded files | `Content-Type` is taken from the upload's declared type but every download response is sent with `X-Content-Type-Options: nosniff`. Previews never use `innerHTML`. |
| SSRF via Hetzner endpoint config | `S3_ENDPOINT_URL` is loaded from env at startup, never per-request. |
| Audit | Every mutation hits `audit_log` with user, action, entity, IP, optional extra_data. Public share downloads logged with `user_id=NULL` and `extra_data.share_id`. |
| Transport | TLS terminated at nginx (Let's Encrypt); HTTP automatically redirects to HTTPS once cert is issued. HSTS can be enabled in `archive-https.conf.template` once the domain is stable. |
| At-rest encryption | Provided by Hetzner Object Storage; intentionally not double-encrypted in v1 (decision recorded in Phase 0). |
| Secrets in image | Dockerfile copies code only; secrets are env-injected at runtime. `.dockerignore` excludes `.env*`. |
| Container hardening | Backend runs as a non-root user (uid 1000), no shell entry, healthcheck via curl. |

## 7. Scalability considerations (v1 baseline)

The v1 sizing target is **2 users + occasional public share viewers**, so
"scale" mostly means "graceful behavior under unexpected load", not horizontal
fan-out.

### What scales naturally
- **Object storage**: scales to terabytes by definition; we never touch the
  data volume on the VPS.
- **Range downloads**: bound by network only; backend memory usage is a single
  iterator + small chunk buffers (no full-object loads).
- **Upload throughput**: bound by S3 — we forward chunks straight through.

### Current single-instance limits (when they would bite)
| Resource | Current behavior | First sign of trouble | Smallest fix |
|---|---|---|---|
| Backend container | One Uvicorn worker (default). Plenty for 2 humans. | Sustained > ~50 concurrent active requests | Bump `--workers` (Uvicorn) to N. |
| In-process rate limiter | Per-instance. | Adding a second backend instance | Move to Redis or to PG with an advisory-lock window counter. |
| Thumbnail/ffmpeg jobs | Done in the same process as the API. | A 1 GB video upload makes API requests jittery during ffmpeg. | Move workers to a sibling container running the same image with a different `CMD`. The code already segregates them under `app/workers/`. |
| Postgres | Shared with other family sites, not under load. | Long-running migrations | Per-app DB is already isolated; could grow `archive` to its own PG instance with one env-var change. |
| Egress | Hetzner is cheap. | Viral share link | Put Cloudflare in front of `archive.<domain>` (free plan). The backend already sets correct cache headers on thumbnails/posters. |
| Process memory | ZIP entry preview reads the entry into memory (cap 100 MB). | Frequent very large entries | Stream-decompress to a `tempfile.SpooledTemporaryFile`. |

### Designed-in extension points
- **Provider swap**: `ObjectStore` is the only file that talks S3. Swapping
  Hetzner → AWS S3 / Backblaze B2 / Cloudflare R2 / MinIO is a config change.
- **Worker split**: `app/workers/manager.py` already orchestrates lifecycle;
  any worker can be moved to a separate container by giving it a different
  `CMD` (no code change in business logic).
- **Multi-instance**: switching the rate limiter and adding sticky sessions
  (or moving sessions into a shared store) are the only two changes needed.
  Sessions are already in Postgres so the second is free.
- **CDN**: thumbnails and posters carry `Cache-Control: public, max-age=
  604800, immutable` and have URLs that include a UUID, so CDN caching is
  safe today.

### 7.x Shared-bucket convention with `family-admin-routine`

The `family-archive` bucket is intentionally shareable with sibling apps in
the monorepo. As of April 2026 it is also used by **`family-admin-routine`**
to store its database/volume backup ZIPs.

Convention:

| App | Owns prefixes |
|---|---|
| `family-archive` | `uploads/`, `files/`, `thumbnails/`, `posters/`, `deleted/` |
| `family-admin-routine` | `admin-routine/backups/<site>_<YYYYMMDD_HHMMSS>.zip` |

This is safe because **the archive backend never enumerates the bucket** — it
only ever reads/writes/deletes keys that it has previously stored in its own
`files`, `thumbnails`, `posters` or `uploads` tables (`s3_key` columns) and
expanded prefixes under `deleted/<id>/`. Objects written by other apps under
unrelated prefixes are therefore invisible to it.

If you ever want hard isolation, override `ADMIN_ROUTINE_BACKUP_S3_BUCKET` in
the web-folders `.env` to point admin-routine at a separate bucket — no code
changes needed in either app.

This document, together with the source code itself and `01-business-overview.md`
and `03-infra-improvements.md`, fully describes Family Archive v1.

