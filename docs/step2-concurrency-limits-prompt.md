# Prompt: Add per-type concurrency semaphores to preview_service

## Context

Project: `family-archive` — a FastAPI/asyncio photo+video archive.

The backend runs thumbnail/poster generation in background asyncio workers.
On startup, `workers/manager.py` creates `THUMBNAIL_WORKER_COUNT` asyncio tasks
that each call `preview_service.generate()`. That function dispatches to:
- `_do_image()` — downloads full file bytes from S3, processes with Pillow
- `_do_video()` — runs `ffmpeg` as a subprocess (via `make_poster_from_url`)
- `_do_audio()` — downloads full file bytes, extracts metadata with mutagen

The problem: all worker types compete for the same slots. `ffmpeg` processes
are much heavier (~100 MB RAM, 1 CPU core each) than image processing (~10 MB).
With `THUMBNAIL_WORKER_COUNT=1` per replica we already solved the OOM issue,
but we can do better: allow 2 concurrent image jobs while still capping ffmpeg at 1.

## Task

Add **per-type asyncio semaphores** inside `preview_service.py` so that:

1. Video (ffmpeg) is capped at **1 concurrent job per process** (`_FFMPEG_SEM`)
2. Images are capped at **2 concurrent jobs per process** (`_IMAGE_SEM`)
3. Audio has no cap (it's fast and memory-light)

The semaphore values should be configurable via `app/core/config.py` settings:
- `FFMPEG_CONCURRENCY: int = 1`  — read from env var `FFMPEG_CONCURRENCY`
- `IMAGE_CONCURRENCY: int = 2`   — read from env var `IMAGE_CONCURRENCY`

The semaphore objects must be created **lazily** (on first use or at worker startup),
not at module import time, because `asyncio.Semaphore()` must be called from within
a running event loop.

The right place to initialise them is `workers/manager.py` — in `WorkerManager.start()`,
right after the queue is created, add:

```python
preview_service.init_semaphores(settings.FFMPEG_CONCURRENCY, settings.IMAGE_CONCURRENCY)
```

And in `preview_service.py` add:

```python
_FFMPEG_SEM: asyncio.Semaphore | None = None
_IMAGE_SEM: asyncio.Semaphore | None = None

def init_semaphores(ffmpeg_concurrency: int, image_concurrency: int) -> None:
    global _FFMPEG_SEM, _IMAGE_SEM
    _FFMPEG_SEM = asyncio.Semaphore(ffmpeg_concurrency)
    _IMAGE_SEM = asyncio.Semaphore(image_concurrency)
```

Then wrap the heavy operations:

```python
async def _do_image(f: File) -> dict:
    async with _IMAGE_SEM:   # guard added
        data = await _read_object(f.s3_key)
        ...

async def _do_video(f: File, *, include_poster: bool) -> dict:
    async with _FFMPEG_SEM:  # guard added
        url = await object_store.presign_get_url(...)
        poster = await make_poster_from_url(url, ...)
        ...
```

## Files to change

- `backend/app/services/preview_service.py`
- `backend/app/workers/manager.py`
- `backend/app/core/config.py`

## Constraints

- Do not change any public function signatures or the queue/worker architecture.
- Do not add new dependencies.
- Add tests in `backend/tests/` that mock `asyncio.Semaphore` and verify:
  - `_do_video` acquires `_FFMPEG_SEM`
  - `_do_image` acquires `_IMAGE_SEM`
  - concurrent video calls beyond the cap are actually queued (use `asyncio.gather` + timing or a counter)
