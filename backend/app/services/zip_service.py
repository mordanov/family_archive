"""Browse a ZIP stored in S3 without full extraction."""
from __future__ import annotations

import io
import logging
import struct
import zipfile
from datetime import datetime

from app.core.config import settings
from app.core.errors import BadRequest, NotFound, TooLarge
from app.models import File
from app.storage.object_store import object_store

log = logging.getLogger(__name__)

EOCD_MAX_COMMENT = 0xFFFF
EOCD_SIG = b"PK\x05\x06"
ZIP64_LOCATOR_SIG = b"PK\x06\x07"
ZIP64_EOCD_SIG = b"PK\x06\x06"


async def list_entries(file: File) -> list[dict]:
    """Read EOCD + central directory via Range GETs and return entry list."""
    cd_data, cd_offset = await _read_central_directory(file)
    entries: list[dict] = []
    # Use zipfile by feeding it a BytesIO containing only the central directory
    # appended at the right offset is complex; simpler: parse manually.
    pos = 0
    while pos < len(cd_data):
        sig = cd_data[pos:pos + 4]
        if sig != b"PK\x01\x02":
            break
        # struct: <4s 4B HHHHH II IIHHHHHHII = 46 bytes header
        hdr = struct.unpack_from("<IHHHHHHIIIHHHHHII", cd_data, pos)
        # mapping per zip spec
        (_sig, _ver_made, _ver_needed, _flags, _method, _mtime, _mdate,
         _crc, comp_size, uncomp_size, name_len, extra_len, comment_len,
         _disk_num, _int_attrs, _ext_attrs, local_offset) = hdr
        name = cd_data[pos + 46: pos + 46 + name_len].decode("utf-8", errors="replace")
        # Parse DOS date/time
        try:
            year = ((_mdate >> 9) & 0x7F) + 1980
            month = (_mdate >> 5) & 0x0F
            day = _mdate & 0x1F
            hour = (_mtime >> 11) & 0x1F
            minute = (_mtime >> 5) & 0x3F
            sec = (_mtime & 0x1F) * 2
            modified = datetime(year, month, day, hour, minute, sec)
        except Exception:
            modified = None
        entries.append({
            "path": name,
            "is_dir": name.endswith("/"),
            "size": uncomp_size,
            "compressed_size": comp_size,
            "modified": modified,
        })
        pos += 46 + name_len + extra_len + comment_len
    return entries


async def stream_entry(file: File, entry_path: str) -> tuple[bytes, str]:
    """Read a single entry from the zip and return (bytes, content_type_guess)."""
    # Build a partial in-memory file using Range reads of: EOCD region + the local file header + entry data.
    # Simplest correct approach: range-read the EOCD area, parse central dir, locate the entry header,
    # then range-read [local_header_offset, local_header_offset + 30 + name_len + extra_len + comp_size].
    cd_data, cd_offset = await _read_central_directory(file)
    pos = 0
    while pos < len(cd_data):
        if cd_data[pos:pos + 4] != b"PK\x01\x02":
            break
        hdr = struct.unpack_from("<IHHHHHHIIIHHHHHII", cd_data, pos)
        (_sig, _vm, _vn, _fl, _m, _mt, _md, _crc, comp_size, uncomp_size,
         name_len, extra_len, comment_len, _dn, _ia, _ea, local_offset) = hdr
        name = cd_data[pos + 46: pos + 46 + name_len].decode("utf-8", errors="replace")
        if name == entry_path:
            if uncomp_size > settings.ZIP_PREVIEW_MAX_BYTES:
                raise TooLarge(f"Entry exceeds preview limit ({settings.ZIP_PREVIEW_MAX_BYTES} bytes)")
            # Read local file header
            lfh = await object_store.get_range_bytes(file.s3_key, local_offset, local_offset + 29)
            if lfh[:4] != b"PK\x03\x04":
                raise BadRequest("Bad local header")
            l_name_len = struct.unpack_from("<H", lfh, 26)[0]
            l_extra_len = struct.unpack_from("<H", lfh, 28)[0]
            data_start = local_offset + 30 + l_name_len + l_extra_len
            data_end = data_start + comp_size - 1
            blob = await object_store.get_range_bytes(file.s3_key, local_offset, data_end)
            with zipfile.ZipFile(io.BytesIO(_pad_to_zip(blob, local_offset))) as zf:
                with zf.open(name) as zh:
                    payload = zh.read()
            import mimetypes
            ctype, _ = mimetypes.guess_type(entry_path)
            return payload, (ctype or "application/octet-stream")
        pos += 46 + name_len + extra_len + comment_len
    raise NotFound("Entry not found in zip")


def _pad_to_zip(blob: bytes, offset: int) -> bytes:
    """zipfile expects a real zip; we provide a minimal one starting at offset 0."""
    # Trick: prepend zero bytes to put local header at exact offset, then append a fake EOCD pointing to 0 entries.
    # Simpler: write a fresh single-entry zip using stdlib by re-extracting via a stream; easier: use blob directly
    # by treating the prepended bytes as the local header at position 0.
    # For robustness with stored entries we'd reimplement parsing. We rebuild a tiny zip:
    # offset of local header in our virtual archive = 0. Append EOCD at the end pointing to it.
    local_at_zero = blob[: ]
    # Build a central directory entry from the local header
    # Local header (PK\x03\x04 ...) is at start.
    # For simplicity, reuse zipfile.ZipFile against blob+EOCD by appending CD that mirrors LFH metadata:
    if blob[:4] != b"PK\x03\x04":
        return blob
    (_sig, ver, flags, method, mtime, mdate, crc, comp_size, uncomp_size,
     name_len, extra_len) = struct.unpack_from("<IHHHHHIIIHH", blob, 0)
    name = blob[30: 30 + name_len]
    cd = struct.pack(
        "<IHHHHHHIIIHHHHHII",
        0x02014b50, ver, ver, flags, method, mtime, mdate,
        crc, comp_size, uncomp_size, name_len, 0, 0, 0, 0, 0, 0,
    ) + name
    cd_offset = len(local_at_zero)
    eocd = struct.pack("<IHHHHIIH", 0x06054b50, 0, 0, 1, 1, len(cd), cd_offset, 0)
    return local_at_zero + cd + eocd


async def _read_central_directory(file: File) -> tuple[bytes, int]:
    """Locate EOCD (last 64KB) and read the central directory bytes."""
    size = file.size_bytes
    if size < 22:
        raise BadRequest("Not a zip")
    tail_len = min(EOCD_MAX_COMMENT + 22, size)
    tail = await object_store.get_range_bytes(file.s3_key, size - tail_len, size - 1)
    eocd_pos = tail.rfind(EOCD_SIG)
    if eocd_pos < 0:
        raise BadRequest("EOCD not found (zip64 not supported in v1)")
    eocd = tail[eocd_pos:eocd_pos + 22]
    (_sig, _disk, _disk_cd, _entries_disk, _entries_total, cd_size, cd_offset, _cl) = struct.unpack(
        "<IHHHHIIH", eocd
    )
    if cd_size == 0xFFFFFFFF or cd_offset == 0xFFFFFFFF:
        raise BadRequest("Zip64 archives not supported in v1")
    cd_data = await object_store.get_range_bytes(file.s3_key, cd_offset, cd_offset + cd_size - 1)
    return cd_data, cd_offset

