"""In-memory leaky-bucket rate limiter, keyed by string (e.g. 'login:1.2.3.4')."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from app.core.errors import TooManyRequests


class RateLimiter:
    def __init__(self, max_events: int, window_seconds: int) -> None:
        self.max = max_events
        self.window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._events[key]
            cutoff = now - self.window
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.max:
                raise TooManyRequests("Too many attempts")
            q.append(now)

