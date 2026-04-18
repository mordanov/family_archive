"""High-level object storage abstraction over S3-compatible backend."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import AsyncIterator

from botocore.exceptions import ClientError

from app.core.config import settings
from app.storage.s3_client import s3_client

log = logging.getLogger(__name__)


@dataclass
class ObjectMeta:
    key: str
    size: int
    etag: str
    content_type: str | None = None


@dataclass
class PartInfo:
    part_number: int
    etag: str
    size: int


class ObjectStore:
    """High-level wrapper. Single chokepoint for all S3 operations."""

    def __init__(self, bucket: str | None = None) -> None:
        self.bucket = bucket or settings.S3_BUCKET

    # ---------- simple ops ----------

    async def put_object(self, key: str, body: bytes, content_type: str = "application/octet-stream") -> str:
        async with s3_client() as c:
            r = await c.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType=content_type)
            return r["ETag"].strip('"')

    async def head_object(self, key: str) -> ObjectMeta | None:
        async with s3_client() as c:
            try:
                r = await c.head_object(Bucket=self.bucket, Key=key)
            except ClientError as e:
                if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                    return None
                raise
            return ObjectMeta(
                key=key,
                size=int(r["ContentLength"]),
                etag=r["ETag"].strip('"'),
                content_type=r.get("ContentType"),
            )

    async def get_object_stream(
        self, key: str, range_header: str | None = None, chunk_size: int = 64 * 1024
    ) -> tuple[AsyncIterator[bytes], dict]:
        """Return an async iterator over object bytes plus headers (status, length, range, content-type)."""
        async with s3_client() as c:
            kwargs = {"Bucket": self.bucket, "Key": key}
            if range_header:
                kwargs["Range"] = range_header
            r = await c.get_object(**kwargs)
            stream = r["Body"]
            meta = {
                "status": 206 if range_header else 200,
                "content_length": r["ContentLength"],
                "content_range": r.get("ContentRange"),
                "content_type": r.get("ContentType", "application/octet-stream"),
                "etag": r["ETag"].strip('"'),
            }

            async def _iter():
                try:
                    async for chunk in stream.iter_chunks(chunk_size=chunk_size):
                        yield chunk
                finally:
                    stream.close()

            return _iter(), meta

    async def get_range_bytes(self, key: str, start: int, end_inclusive: int) -> bytes:
        """Read a small explicit byte range and return as bytes (used by ZIP browsing)."""
        async with s3_client() as c:
            r = await c.get_object(Bucket=self.bucket, Key=key, Range=f"bytes={start}-{end_inclusive}")
            try:
                return await r["Body"].read()
            finally:
                r["Body"].close()

    async def delete_object(self, key: str) -> None:
        async with s3_client() as c:
            try:
                await c.delete_object(Bucket=self.bucket, Key=key)
            except ClientError as e:
                if e.response["Error"]["Code"] not in ("404", "NoSuchKey"):
                    raise

    async def delete_prefix(self, prefix: str) -> int:
        """Delete all objects under a key prefix. Returns number deleted."""
        deleted = 0
        async with s3_client() as c:
            paginator = c.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                items = page.get("Contents") or []
                if not items:
                    continue
                await c.delete_objects(
                    Bucket=self.bucket,
                    Delete={"Objects": [{"Key": i["Key"]} for i in items], "Quiet": True},
                )
                deleted += len(items)
        return deleted

    # ---------- multipart ----------

    async def create_multipart(self, key: str, content_type: str = "application/octet-stream") -> str:
        async with s3_client() as c:
            r = await c.create_multipart_upload(Bucket=self.bucket, Key=key, ContentType=content_type)
            return r["UploadId"]

    async def upload_part(self, key: str, upload_id: str, part_number: int, body: bytes) -> str:
        async with s3_client() as c:
            r = await c.upload_part(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
                PartNumber=part_number,
                Body=body,
            )
            return r["ETag"].strip('"')

    async def list_parts(self, key: str, upload_id: str) -> list[PartInfo]:
        out: list[PartInfo] = []
        async with s3_client() as c:
            kwargs = {"Bucket": self.bucket, "Key": key, "UploadId": upload_id}
            while True:
                r = await c.list_parts(**kwargs)
                for p in r.get("Parts", []) or []:
                    out.append(
                        PartInfo(
                            part_number=p["PartNumber"],
                            etag=p["ETag"].strip('"'),
                            size=int(p["Size"]),
                        )
                    )
                if not r.get("IsTruncated"):
                    break
                kwargs["PartNumberMarker"] = r["NextPartNumberMarker"]
        return out

    async def complete_multipart(
        self, key: str, upload_id: str, parts: list[tuple[int, str]]
    ) -> None:
        parts_payload = [{"PartNumber": n, "ETag": f'"{e}"' if not e.startswith('"') else e}
                         for n, e in sorted(parts)]
        async with s3_client() as c:
            await c.complete_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts_payload},
            )

    async def abort_multipart(self, key: str, upload_id: str) -> None:
        async with s3_client() as c:
            try:
                await c.abort_multipart_upload(Bucket=self.bucket, Key=key, UploadId=upload_id)
            except ClientError as e:
                if e.response["Error"]["Code"] not in ("404", "NoSuchUpload"):
                    raise

    async def list_in_progress_multiparts(self) -> list[tuple[str, str, str]]:
        """Returns (key, upload_id, initiated_iso) for orphan multipart uploads."""
        out: list[tuple[str, str, str]] = []
        async with s3_client() as c:
            paginator = c.get_paginator("list_multipart_uploads")
            async for page in paginator.paginate(Bucket=self.bucket):
                for u in page.get("Uploads") or []:
                    out.append((u["Key"], u["UploadId"], u["Initiated"].isoformat()))
        return out


# Default singleton
object_store = ObjectStore()

