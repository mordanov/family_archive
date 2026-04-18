"""Application configuration loaded from environment."""
from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://archive:archive@localhost:5432/archive"

    # Auth / sessions
    SECRET_KEY: str = "change-me-archive-secret"
    SESSION_COOKIE_NAME: str = "archive_session"
    SESSION_LIFETIME_DAYS: int = 30
    COOKIE_SECURE: bool = True
    COOKIE_DOMAIN: str | None = None

    # Seeded users
    ARCHIVE_USER1_USERNAME: str = "user1"
    ARCHIVE_USER1_PASSWORD: str = "change-me-1"
    ARCHIVE_USER2_USERNAME: str = "user2"
    ARCHIVE_USER2_PASSWORD: str = "change-me-2"

    # S3 / Hetzner Object Storage
    S3_ENDPOINT_URL: str = "http://minio:9000"
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "family-archive"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_FORCE_PATH_STYLE: bool = True

    # Limits
    MAX_FILE_SIZE_BYTES: int = 20 * 1024 * 1024 * 1024  # 20 GB
    CHUNK_SIZE_BYTES: int = 8 * 1024 * 1024              # 8 MB
    TRASH_RETENTION_DAYS: int = 30
    INLINE_THUMBNAIL_MAX_BYTES: int = 50 * 1024 * 1024
    MULTIPART_GC_AFTER_HOURS: int = 24
    MAX_FOLDER_DEPTH: int = 32
    MAX_LOGIN_ATTEMPTS_PER_15MIN: int = 5

    # ZIP browsing
    ZIP_PREVIEW_MAX_BYTES: int = 100 * 1024 * 1024

    # CORS / cookies
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173"]

    # Misc
    LOG_LEVEL: str = "INFO"
    ENV: str = "production"

    @property
    def chunk_size(self) -> int:
        return self.CHUNK_SIZE_BYTES


settings = Settings()

