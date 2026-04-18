"""Trash management: list, restore, purge."""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import audit as audit_repo
from app.repositories import files as files_repo
from app.repositories import folders as folders_repo
from app.storage.object_store import object_store

log = logging.getLogger(__name__)


async def list_trash(db: AsyncSession):
    return await folders_repo.list_trashed(db), await files_repo.list_trashed(db)


async def restore_file(db: AsyncSession, file_id: int, user_id: int, ip: str | None):
    f = await files_repo.get(db, file_id, include_deleted=True)
    if f.deleted_at is None:
        return f
    # If parent folder is also deleted, move to root
    parent = await folders_repo.get(db, f.folder_id, include_deleted=True)
    if parent.deleted_at is not None:
        f.folder_id = 1
    await files_repo.restore(db, f)
    await audit_repo.log(db, user_id=user_id, action="restore", entity_type="file", entity_id=f.id, ip=ip)
    return f


async def restore_folder(db: AsyncSession, folder_id: int, user_id: int, ip: str | None):
    folder = await folders_repo.get(db, folder_id, include_deleted=True)
    if folder.deleted_at is None:
        return folder
    parent = await folders_repo.get(db, folder.parent_id, include_deleted=True) if folder.parent_id else None
    if parent and parent.deleted_at is not None:
        folder.parent_id = 1
    await folders_repo.restore(db, folder)
    await audit_repo.log(db, user_id=user_id, action="restore", entity_type="folder", entity_id=folder.id, ip=ip)
    return folder


async def purge_due(db: AsyncSession) -> int:
    files = await files_repo.list_due_for_purge(db)
    count = 0
    for f in files:
        try:
            await object_store.delete_object(f.s3_key)
            await object_store.delete_prefix(f"thumbnails/{f.uuid}/")
            await object_store.delete_object(f"posters/{f.uuid}.jpg")
            await files_repo.hard_delete(db, f)
            count += 1
        except Exception as e:
            log.warning("purge failed for file %s: %s", f.id, e)
    return count

