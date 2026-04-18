"""RFC 7233 Range header parsing (single-range only)."""
from __future__ import annotations

from dataclasses import dataclass

from app.core.errors import RangeNotSatisfiable


@dataclass
class ByteRange:
    start: int
    end: int  # inclusive

    @property
    def length(self) -> int:
        return self.end - self.start + 1


def parse_range(header: str | None, total_size: int) -> ByteRange | None:
    """Parse a single byte range like 'bytes=0-1023' or 'bytes=500-' or 'bytes=-500'."""
    if not header:
        return None
    if not header.startswith("bytes="):
        raise RangeNotSatisfiable()
    spec = header[len("bytes="):].split(",")[0].strip()
    if "-" not in spec:
        raise RangeNotSatisfiable()
    start_s, end_s = spec.split("-", 1)
    try:
        if start_s == "":
            # suffix range: last N bytes
            n = int(end_s)
            if n <= 0:
                raise RangeNotSatisfiable()
            start = max(0, total_size - n)
            end = total_size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else total_size - 1
    except ValueError:
        raise RangeNotSatisfiable()
    if start < 0 or end < start or start >= total_size:
        raise RangeNotSatisfiable()
    end = min(end, total_size - 1)
    return ByteRange(start, end)

