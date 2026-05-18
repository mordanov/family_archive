"""Application configuration loaded from environment."""
from __future__ import annotations

import json
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://archive:archive@localhost:5432/archive"

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
    THUMBNAIL_DIR: str = "/app/data/thumbnails"
    THUMBNAIL_MAX_SIDE: int = 256
    THUMBNAIL_WORKER_COUNT: int = 2
    DB_POOL_SIZE: int = 20
    DB_POOL_OVERFLOW: int = 20
    MULTIPART_GC_AFTER_HOURS: int = 24
    MAX_FOLDER_DEPTH: int = 32
    MAX_LOGIN_ATTEMPTS_PER_15MIN: int = 5

    # ZIP browsing
    ZIP_PREVIEW_MAX_BYTES: int = 100 * 1024 * 1024

    # CORS / cookies
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    @property
    def allowed_origins(self) -> List[str]:
        value = self.ALLOWED_ORIGINS.strip()
        if not value:
            return []
        if value.startswith("["):
            parsed = json.loads(value)
            if not isinstance(parsed, list):
                raise ValueError("ALLOWED_ORIGINS JSON value must be an array")
            return [str(s).strip() for s in parsed if str(s).strip()]
        return [s.strip() for s in value.split(",") if s.strip()]

    # Misc
    LOG_LEVEL: str = "INFO"
    ENV: str = "production"

    @property
    def chunk_size(self) -> int:
        return self.CHUNK_SIZE_BYTES


settings = Settings()

