"""Share-link service."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, verify_password
from app.core.errors import BadRequest, Forbidden
from app.repositories import audit as audit_repo
from app.repositories import shares as shares_repo
from app.schemas import ShareCreate


async def create(db: AsyncSession, *, payload: ShareCreate, user_id: int, ip: str | None):
    if payload.target_type == "file" and not payload.file_id:
        raise BadRequest("file_id required")
    if payload.target_type == "folder" and not payload.folder_id:
        raise BadRequest("folder_id required")
    pw_hash = hash_password(payload.password) if payload.password else None
    s = await shares_repo.create(
        db,
        target_type=payload.target_type,
        file_id=payload.file_id if payload.target_type == "file" else None,
        folder_id=payload.folder_id if payload.target_type == "folder" else None,
        password_hash=pw_hash,
        expires_at=payload.expires_at,
        max_downloads=payload.max_downloads,
        created_by=user_id,
    )
    await audit_repo.log(db, user_id=user_id, action="share_create", entity_type="share", entity_id=s.id, ip=ip)
    return s


async def revoke(db: AsyncSession, *, share_id: int, user_id: int, ip: str | None):
    s = await shares_repo.get(db, share_id)
    await shares_repo.revoke(db, s)
    await audit_repo.log(db, user_id=user_id, action="share_revoke", entity_type="share", entity_id=share_id, ip=ip)


def check_password(s, password: str | None) -> None:
    if s.password_hash:
        if not password or not verify_password(s.password_hash, password):
            raise Forbidden("Password required or invalid")

