"""Upload service: orchestrates DB upload state with S3 multipart."""
from __future__ import annotations

import math
import uuid as uuid_lib

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import BadRequest, Conflict, NotFound, TooLarge
from app.repositories import audit as audit_repo
from app.repositories import files as files_repo
from app.repositories import folders as folders_repo
from app.repositories import uploads as uploads_repo
from app.services import preview_service
from app.storage.object_store import object_store
from app.utils.filenames import sanitize_name


async def init_upload(
    db: AsyncSession, *, user_id: int, folder_id: int, filename: str, size_bytes: int, content_type: str, ip: str | None
):
    if size_bytes > settings.MAX_FILE_SIZE_BYTES:
        raise TooLarge(f"File exceeds {settings.MAX_FILE_SIZE_BYTES} bytes")
    if size_bytes < 0:
        raise BadRequest("Negative size")
    folder = await folders_repo.get(db, folder_id)
    name = sanitize_name(filename)
    await files_repo.assert_unique_name(db, folder.id, name)

    chunk = settings.CHUNK_SIZE_BYTES
    total_parts = max(1, math.ceil(size_bytes / chunk)) if size_bytes > 0 else 1

    new_uuid = uuid_lib.uuid4()
    s3_key = f"files/{new_uuid}"
    upload_id = await object_store.create_multipart(s3_key, content_type)

    up = await uploads_repo.create(
        db,
        id=new_uuid,
        user_id=user_id,
        folder_id=folder.id,
        filename=name,
        size_bytes=size_bytes,
        content_type=content_type,
        chunk_size=chunk,
        total_parts=total_parts,
        s3_key=s3_key,
        s3_upload_id=upload_id,
        status="uploading",
    )
    await audit_repo.log(db, user_id=user_id, action="upload_init", entity_type="upload", entity_id=None,
                         extra={"upload_id": str(up.id), "filename": name, "size": size_bytes}, ip=ip)
    return up


async def receive_part(
    db: AsyncSession, *, upload_id: uuid_lib.UUID, user_id: int, part_number: int, body: bytes
) -> str:
    up = await uploads_repo.get(db, upload_id, user_id=user_id)
    if up.status != "uploading":
        raise Conflict(f"Upload not in uploading state ({up.status})")
    if part_number < 1 or part_number > up.total_parts:
        raise BadRequest("Invalid part number")
    is_last = part_number == up.total_parts
    expected = up.chunk_size if not is_last else (up.size_bytes - up.chunk_size * (up.total_parts - 1)) or up.chunk_size
    if not is_last and len(body) != up.chunk_size:
        raise BadRequest(f"Part {part_number} expected {up.chunk_size} bytes, got {len(body)}")
    if is_last and len(body) != expected:
        raise BadRequest(f"Last part expected {expected} bytes, got {len(body)}")

    etag = await object_store.upload_part(up.s3_key, up.s3_upload_id, part_number, body)
    await uploads_repo.upsert_part(db, up.id, part_number, etag, len(body))
    return etag


async def complete_upload(db: AsyncSession, *, upload_id: uuid_lib.UUID, user_id: int, ip: str | None):
    up = await uploads_repo.get(db, upload_id, user_id=user_id)
    if up.status == "completed":
        raise Conflict("Already completed")
    parts = sorted(up.parts, key=lambda p: p.part_number)
    if len(parts) != up.total_parts:
        raise Conflict(f"Missing parts: have {len(parts)}, need {up.total_parts}")
    await object_store.complete_multipart(up.s3_key, up.s3_upload_id, [(p.part_number, p.etag) for p in parts])
    file = await files_repo.create(
        db,
        folder_id=up.folder_id,
        name=up.filename,
        size_bytes=up.size_bytes,
        content_type=up.content_type,
        s3_key=up.s3_key,
        user_id=user_id,
    )
    await uploads_repo.mark_status(db, up, "completed")
    await audit_repo.log(db, user_id=user_id, action="upload_complete", entity_type="file", entity_id=file.id, ip=ip)
    # Schedule preview generation (best-effort).
    await preview_service.generate_for_new_file(file)
    return file


async def abort_upload(db: AsyncSession, *, upload_id: uuid_lib.UUID, user_id: int, ip: str | None):
    up = await uploads_repo.get(db, upload_id, user_id=user_id)
    if up.status == "completed":
        raise Conflict("Cannot abort completed upload")
    await object_store.abort_multipart(up.s3_key, up.s3_upload_id)
    await uploads_repo.mark_status(db, up, "aborted")
    await audit_repo.log(db, user_id=user_id, action="upload_abort", entity_type="upload", extra={"id": str(up.id)}, ip=ip)


async def resume_info(db: AsyncSession, *, upload_id: uuid_lib.UUID, user_id: int):
    up = await uploads_repo.get(db, upload_id, user_id=user_id)
    if up.status != "uploading":
        return up
    # cross-check S3 against DB
    s3_parts = {p.part_number: p for p in await object_store.list_parts(up.s3_key, up.s3_upload_id)}
    db_parts = {p.part_number for p in up.parts}
    # backfill any S3-known parts missing from DB
    for n, p in s3_parts.items():
        if n not in db_parts:
            await uploads_repo.upsert_part(db, up.id, n, p.etag, p.size)
    return await uploads_repo.get(db, up.id, user_id=user_id)

