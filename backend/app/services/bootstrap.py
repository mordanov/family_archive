"""Bootstrap default users on startup."""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password
from app.core.config import settings
from app.repositories import users as users_repo

log = logging.getLogger(__name__)


async def ensure_default_users(db: AsyncSession) -> None:
    pairs = [
        (settings.ARCHIVE_USER1_USERNAME, settings.ARCHIVE_USER1_PASSWORD),
        (settings.ARCHIVE_USER2_USERNAME, settings.ARCHIVE_USER2_PASSWORD),
    ]
    for username, password in pairs:
        if not username or not password:
            continue
        existing = await users_repo.get_by_username(db, username)
        if existing:
            continue
        await users_repo.create(db, username, hash_password(password))
        log.info("Seeded user: %s", username)
    await db.commit()

