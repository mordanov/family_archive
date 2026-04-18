#!/bin/bash
set -e

echo "Waiting for database..."
python - <<'PY'
import asyncio, os, asyncpg
url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg", "postgresql")
async def wait():
    for _ in range(60):
        try:
            conn = await asyncpg.connect(url)
            await conn.close()
            return
        except Exception:
            await asyncio.sleep(1)
    raise SystemExit("DB not reachable")
asyncio.run(wait())
PY

echo "Running migrations..."
alembic upgrade head

if [ "${ARCHIVE_RELOAD:-0}" = "1" ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

