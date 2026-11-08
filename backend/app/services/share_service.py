"""Share-link service."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password, verify_password
from app.core.errors import BadRequest, Forbidden
from app.repositories import audit as audit_repo
from app.repositories import files as files_repo
from app.repositories import folders as folders_repo
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



MAX_FOLDER_LINKS = 500


async def create_folder_links(
    db: AsyncSession, *, folder_id: int, expires_at, user_id: int, ip: str | None
) -> list[tuple]:
    """Create one passwordless file share per file under the folder (recursive)."""
    root = await folders_repo.get(db, folder_id)
    pending = [(root, "")]
    found: list[tuple] = []
    while pending:
        folder, prefix = pending.pop(0)
        for f in await files_repo.list_in_folder(db, folder.id):
            found.append((f, prefix + f.name))
            if len(found) > MAX_FOLDER_LINKS:
                raise BadRequest(f"Folder has more than {MAX_FOLDER_LINKS} files")
        for child in await folders_repo.list_children(db, folder.id):
            pending.append((child, f"{prefix}{child.name}/"))
    out = []
    for f, path in found:
        s = await shares_repo.create(
            db, target_type="file", file_id=f.id, folder_id=None,
            password_hash=None, expires_at=expires_at, max_downloads=None, created_by=user_id,
        )
        out.append((f.id, path, s.token))
    await audit_repo.log(
        db, user_id=user_id, action="share_create_folder_links", entity_type="folder",
        entity_id=folder_id, ip=ip, extra={"count": len(out)},
    )
    return out
