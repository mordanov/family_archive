# Spec: Replace in-process asyncio queue with Redis + ARQ external task queue

## Problem

The current thumbnail/poster generation system uses an `asyncio.Queue` inside each
uvicorn process. This creates two issues at scale:

1. **No cross-replica coordination** — with N replicas each holding their own queue,
   all N replicas attempt to process the same burst of uploads simultaneously,
   multiplying peak memory usage by N.
2. **No persistence** — jobs in the in-memory queue are lost on container restart
   or OOM kill. A bulk upload of 2000 files that causes OOM means all pending
   thumbnail jobs vanish silently.

## Goal

Replace the asyncio.Queue + in-process workers with **Redis + ARQ** (async-native
Python task queue built on Redis Streams). ARQ is already a common choice for
FastAPI/asyncio stacks and requires no new language runtime.

## Architecture after this change

```
                  ┌─────────────────────────────┐
                  │  archive-backend (2 replicas) │
                  │  FastAPI only — no workers    │
                  │  enqueues jobs via ARQ client │
                  └─────────────┬───────────────┘
                                │ Redis Streams
                  ┌─────────────▼───────────────┐
                  │  archive-worker (1 replica)   │
                  │  ARQ worker process           │
                  │  FFMPEG_CONCURRENCY=1         │
                  │  IMAGE_CONCURRENCY=2          │
                  │  memory limit: 800m           │
                  └─────────────────────────────┘
                                │
                  ┌─────────────▼───────────────┐
                  │  Redis 7 (1 replica)          │
                  │  memory limit: 256m           │
                  └─────────────────────────────┘
```

## Requirements

### Docker Compose changes (`docker-compose.yml`)

Add two new services:

```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  deploy:
    resources:
      limits:
        memory: 256m
  volumes:
    - archive_redis_data:/data
  command: redis-server --save 60 1 --loglevel warning

archive-worker:
  build:
    context: ./backend
    dockerfile: Dockerfile
  restart: unless-stopped
  command: python -m arq app.workers.arq_worker.WorkerSettings
  deploy:
    replicas: 1
    resources:
      limits:
        memory: 800m
  environment:
    # same env vars as archive-backend, plus:
    REDIS_URL: redis://redis:6379
    FFMPEG_CONCURRENCY: "1"
    IMAGE_CONCURRENCY: "2"
```

Remove `THUMBNAIL_WORKER_COUNT` from `archive-backend` environment — the backend
no longer runs workers.

Add `archive_redis_data` to the `volumes:` section.

### Backend changes

**`backend/app/core/config.py`**
- Add `REDIS_URL: str = "redis://localhost:6379"`
- Remove `THUMBNAIL_WORKER_COUNT` (or keep it but ignore it in the new flow)

**`backend/app/workers/arq_worker.py`** (new file)

Define ARQ WorkerSettings and the task functions that currently live in
`preview_service.py` (`generate`, `_do_image`, `_do_video`, `_do_audio`).

```python
from arq import Worker
from arq.connections import RedisSettings

async def generate_preview(ctx, file_id: int) -> None:
    """ARQ task. Equivalent to current preview_service.generate()."""
    ...

class WorkerSettings:
    functions = [generate_preview]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 4          # total concurrent jobs in this worker process
    job_timeout = 300     # 5 min max per job
    keep_result = 0       # don't store results; we write to DB directly
```

**`backend/app/services/preview_service.py`**
- Replace `await QUEUE.put(file_id)` with ARQ enqueue:
  ```python
  from arq.connections import create_pool, RedisSettings
  _redis_pool = None

  async def get_redis():
      global _redis_pool
      if _redis_pool is None:
          _redis_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
      return _redis_pool

  async def generate_for_new_file(file: File) -> None:
      redis = await get_redis()
      await redis.enqueue_job("generate_preview", file.id)
  ```
- Remove `QUEUE`, `_IN_FLIGHT`, `_IN_FLIGHT_LOCK`, `_enqueue`, `release_job`
- Keep `generate()`, `_do_image()`, `_do_video()`, `_do_audio()` — they move to
  `arq_worker.py` or stay in `preview_service.py` and are imported by the worker.

**`backend/app/workers/manager.py`**
- Remove all thumbnail worker startup logic
- Keep `trash_purge_loop` and `multipart_gc_loop` startup (they stay in-process)

**`backend/requirements.txt`** (or `pyproject.toml`)
- Add `arq>=0.26`

### ARQ deduplication (replaces `_IN_FLIGHT`)

ARQ supports job deduplication via `job_id`:
```python
await redis.enqueue_job("generate_preview", file.id, _job_id=f"preview-{file.id}")
```
If a job with that ID already exists in the queue, ARQ silently skips the duplicate.
This replaces the current `_IN_FLIGHT` set.

### Per-type concurrency inside the worker

The worker runs in a single process. Use module-level `asyncio.Semaphore` objects
(safe here because there's exactly one event loop):

```python
_FFMPEG_SEM = asyncio.Semaphore(int(os.getenv("FFMPEG_CONCURRENCY", "1")))
_IMAGE_SEM  = asyncio.Semaphore(int(os.getenv("IMAGE_CONCURRENCY", "2")))
```

### Health check

Add a `/health/worker` endpoint to the backend that checks Redis connectivity:
```python
redis = await get_redis()
await redis.ping()
```
Return 200 if Redis responds, 503 otherwise.

## Migration path

1. Deploy Redis + archive-worker alongside existing replicas.
2. Set `THUMBNAIL_WORKER_COUNT=0` on existing backend replicas to disable in-process workers
   (jobs will be processed by the new worker instead).
3. Once stable, remove `THUMBNAIL_WORKER_COUNT` handling entirely.

## Out of scope

- Job retry logic beyond ARQ defaults (3 retries with exponential backoff).
- Priority queues (all jobs share one queue).
- Distributed locking for `trash_purge_loop` and `multipart_gc_loop`
  (they can stay in-process in one backend replica, or be moved to the worker later).

## Acceptance criteria

- Uploading 2000 mixed files including large videos does not cause OOM on 4 GB VPS.
- Pending thumbnail jobs survive a backend container restart.
- `docker compose up` starts all services without manual steps.
- Existing API contracts (upload, preview, file listing) are unchanged.
- Unit tests cover: job enqueue calls Redis with correct job_id, duplicate enqueue is a no-op.
