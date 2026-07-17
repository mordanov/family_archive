from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password
from app.repositories import users as users_repo

_DEFAULT_USERS = [
    ("tester", "testpass"),
]


async def ensure_default_users(db: AsyncSession) -> None:
    for username, password in _DEFAULT_USERS:
        existing = await users_repo.get_by_username(db, username)
        if existing is None:
            await users_repo.create(db, username, hash_password(password))
    await db.commit()
