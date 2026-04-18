# Family Archive

Web-based family file archive on top of S3-compatible object storage.
For 2 users, full access, no RBAC.

## Phase 2 status
Backend (FastAPI + asyncpg + Alembic + aiobotocore) is complete:
folders, files, chunked resumable uploads, previews (image/video/audio),
ZIP browsing, share links (with optional password/expiry/limit), trash with
30-day soft-delete and purge worker, audit log.

## Phase 3 status
Frontend (React 18 + Vite + TS + Tailwind + TanStack Query + Zustand + IndexedDB):
Finder-like browser, drag-and-drop chunked uploads with pause/resume that survives page reloads,
previews for image/video/audio/zip, share dialog, trash, login.

## Phase 4 status
Infrastructure & deployment complete:
- Production `Dockerfile` (backend) with ffmpeg + non-root user + healthcheck.
- Standalone `docker-compose.yml` (own postgres + nginx) for solo deployments.
- Full integration into the shared **web-folders** stack: 3 nginx templates with
  large-upload tuning, automatic HTTP→HTTPS switch on certificate availability,
  shared Postgres role, certbot, deploy script, env contract.
- CI: `.github/workflows/ci.yml` runs backend pytest + frontend vitest + Docker build.
- VPS deploy: shared workflow `web-folders/.github/workflows/deploy-vps.yml` extended;
  per-app `deploy/deploy.sh` for standalone use.

## Run locally (dev)
```bash
docker compose -f docker-compose.dev.yml up --build
# Frontend: http://localhost:5173
# API:      http://localhost:8000/api/v1
# MinIO:    http://localhost:9001 (minioadmin / minioadmin)
```

## Run in production (standalone)
```bash
cp .env.example .env  # fill in S3 + secrets + passwords
./deploy/deploy.sh    # builds, starts, runs migrations, health-checks
# Then put a TLS-terminating reverse proxy in front, or use the shared web-folders stack.
```

## Run as part of the shared web-folders stack
1. In `web-folders/.env`, set the new `ARCHIVE_*` values (see `.env.example`).
2. `cd web-folders && bash deploy-one-db.sh`
3. `bash issue-certificates.sh` (first-time TLS) — nginx auto-switches to HTTPS within
   `NGINX_CERT_POLL_INTERVAL` seconds.

## Run tests
```bash
# backend
cd backend && pip install -r requirements-dev.txt && pytest
# frontend
cd frontend && npm install && npm test
```

## Phase 5 status
Documentation complete. See [`docs/`](./docs/README.md):
- [Business overview](./docs/01-business-overview.md) — what & why for non-engineers.
- [Technical architecture](./docs/02-technical-architecture.md) — diagrams, data flows, schema, decisions.
- [Infra improvements](./docs/03-infra-improvements.md) — prioritised scalability / fault-tolerance / HA roadmap.

## Phases
- [x] Phase 0: clarification
- [x] Phase 1: architecture
- [x] Phase 2: backend
- [x] Phase 3: frontend
- [x] Phase 4: infrastructure & deployment
- [x] Phase 5: documentation



