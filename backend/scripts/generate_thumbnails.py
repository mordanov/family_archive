#!/usr/bin/env python3
"""Bulk thumbnail generation for files missing thumbnails.

Usage (inside container):
    python scripts/generate_thumbnails.py
    python scripts/generate_thumbnails.py --concurrency 8
    python scripts/generate_thumbnails.py --dry-run

Usage (via docker exec):
    docker exec archive-backend-1 python scripts/generate_thumbnails.py --concurrency 4
"""
from __future__ import annotations

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, or_, and_

from app.db.session import AsyncSessionLocal
from app.models import File
from app.services.preview_service import generate


async def main(concurrency: int, dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(File).where(
                and_(
                    File.deleted_at.is_(None),
                    File.has_thumbnail == False,  # noqa: E712
                    or_(
                        File.content_type.like("image/%"),
                        File.content_type.like("video/%"),
                    ),
                )
            ).order_by(File.id)
        )
        files = result.scalars().all()

    total = len(files)
    print(f"Found {total} file(s) without thumbnails")

    if dry_run or total == 0:
        return

    sem = asyncio.Semaphore(concurrency)
    done = 0
    errors = 0

    async def process_one(file_id: int) -> None:
        nonlocal done, errors
        async with sem:
            try:
                await generate(file_id)
                done += 1
                print(f"[{done}/{total}] file {file_id}")
            except Exception as e:
                errors += 1
                print(f"[ERROR] file {file_id}: {e}", file=sys.stderr)

    await asyncio.gather(*[process_one(f.id) for f in files])
    print(f"\nDone: {done} generated, {errors} errors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk thumbnail generation")
    parser.add_argument("--concurrency", type=int, default=4, metavar="N",
                        help="concurrent workers (default: 4)")
    parser.add_argument("--dry-run", action="store_true",
                        help="count only, do not generate")
    args = parser.parse_args()
    asyncio.run(main(args.concurrency, args.dry_run))
