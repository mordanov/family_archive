"""Pydantic v2 DTOs for API."""
from __future__ import annotations

import uuid as uuid_lib
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)
    remember_me: bool = False


class UserOut(_ORM):
    id: int
    username: str


# ---------- folders ----------
class FolderOut(_ORM):
    id: int
    parent_id: int | None
    name: str
    created_at: datetime
    updated_at: datetime


class FolderCreate(BaseModel):
    parent_id: int
    name: str = Field(min_length=1, max_length=255)


class FolderPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: int | None = None


class Breadcrumb(BaseModel):
    id: int
    name: str


class FolderDetail(BaseModel):
    folder: FolderOut
    breadcrumb: list[Breadcrumb]


# ---------- files ----------
class TagOut(_ORM):
    id: int
    name: str
    color: str | None = None


class FileOut(_ORM):
    id: int
    uuid: uuid_lib.UUID
    folder_id: int
    name: str
    size_bytes: int
    content_type: str
    has_thumbnail: bool
    has_poster: bool
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []


class FilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    folder_id: int | None = None


class FolderListing(BaseModel):
    folders: list[FolderOut]
    files: list[FileOut]
    next_cursor: str | None = None


# ---------- uploads ----------
class UploadCreate(BaseModel):
    folder_id: int
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(ge=0)
    content_type: str = Field(min_length=1, max_length=255)


class UploadPartInfo(BaseModel):
    part_number: int
    size: int
    etag: str


class UploadOut(BaseModel):
    id: uuid_lib.UUID
    folder_id: int
    filename: str
    size_bytes: int
    content_type: str
    chunk_size: int
    total_parts: int
    status: str
    parts: list[UploadPartInfo]


class UploadCompleteOut(BaseModel):
    file: FileOut


# ---------- tags ----------
class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=16)


# ---------- shares ----------
class ShareCreate(BaseModel):
    target_type: Literal["file", "folder"]
    file_id: int | None = None
    folder_id: int | None = None
    password: str | None = Field(default=None, min_length=1, max_length=128)
    expires_at: datetime | None = None
    max_downloads: int | None = Field(default=None, ge=1)


class ShareOut(_ORM):
    id: int
    token: str
    target_type: str
    file_id: int | None
    folder_id: int | None
    has_password: bool
    expires_at: datetime | None
    max_downloads: int | None
    download_count: int
    created_at: datetime
    revoked_at: datetime | None


class SharePublicMeta(BaseModel):
    token: str
    target_type: str
    name: str
    requires_password: bool
    expires_at: datetime | None
    files: list[FileOut] | None = None
    folders: list[FolderOut] | None = None


class ShareUnlock(BaseModel):
    password: str


# ---------- audit ----------
class AuditEntry(_ORM):
    id: int
    user_id: int | None
    action: str
    entity_type: str | None
    entity_id: int | None
    extra_data: dict | None
    ip: str | None
    created_at: datetime


# ---------- zip ----------
class ZipEntry(BaseModel):
    path: str
    is_dir: bool
    size: int
    compressed_size: int
    modified: datetime | None

