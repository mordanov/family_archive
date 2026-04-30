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
python - <<'PY'
import asyncio, os, asyncpg, subprocess, sys

url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg", "postgresql")

async def migrate():
    conn = await asyncpg.connect(url)
    try:
        await conn.execute("SELECT pg_advisory_lock(7391823456)")
        r = subprocess.run(["alembic", "upgrade", "head"], check=False)
        if r.returncode != 0:
            sys.exit("Migration failed")
    finally:
        try:
            await conn.execute("SELECT pg_advisory_unlock(7391823456)")
        finally:
            await conn.close()

asyncio.run(migrate())
PY

if [ "${ARCHIVE_RELOAD:-0}" = "1" ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

