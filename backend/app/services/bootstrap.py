import os

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password
from app.repositories import users as users_repo


def _configured_users() -> list[tuple[str, str]]:
    result = []
    for i in range(1, 10):
        username = os.environ.get(f"ARCHIVE_USER{i}_USERNAME", "").strip()
        password = os.environ.get(f"ARCHIVE_USER{i}_PASSWORD", "").strip()
        if username and password:
            result.append((username, password))
    return result


async def ensure_default_users(db: AsyncSession) -> None:
    for username, password in _configured_users():
        existing = await users_repo.get_by_username(db, username)
        if existing is None:
            await users_repo.create(db, username, hash_password(password))
    await db.commit()
