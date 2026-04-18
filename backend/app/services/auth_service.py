"""Auth service: login/logout."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, needs_rehash, verify_password
from app.auth.sessions import create_session, delete_session
from app.core.errors import Unauthorized
from app.repositories import audit as audit_repo
from app.repositories import users as users_repo


async def login(
    db: AsyncSession, username: str, password: str, ip: str | None, user_agent: str | None
):
    user = await users_repo.get_by_username(db, username)
    if not user or not verify_password(user.password_hash, password):
        raise Unauthorized("Invalid credentials")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    sess = await create_session(db, user.id, ip, user_agent)
    await audit_repo.log(db, user_id=user.id, action="login", ip=ip)
    return user, sess


async def logout(db: AsyncSession, session_id, user_id: int, ip: str | None) -> None:
    await delete_session(db, session_id)
    await audit_repo.log(db, user_id=user_id, action="logout", ip=ip)

