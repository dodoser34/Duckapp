"""In-process sliding-window rate limiter with bounded memory.

The previous implementation kept a module-level ``dict`` whose keys were never
removed, so probing random usernames grew it without limit. This version
evicts empty buckets on every sweep and hard-caps the number of tracked keys.
"""

import time
from collections import deque
from threading import Lock

DEFAULT_MAX_TRACKED_KEYS = 50_000
_PRUNE_EVERY_SECONDS = 60.0


class RateLimiter:
    def __init__(
        self,
        window_seconds: int,
        max_events: int,
        max_tracked_keys: int = DEFAULT_MAX_TRACKED_KEYS,
    ) -> None:
        self.window_seconds = max(1, int(window_seconds))
        self.max_events = max(1, int(max_events))
        self.max_tracked_keys = max(1, int(max_tracked_keys))
        self._buckets: dict[str, deque[float]] = {}
        self._lock = Lock()
        self._last_prune = 0.0

    def _sweep_expired(self, now: float) -> None:
        """Drop buckets whose newest event already fell out of the window.

        Throttled, because it walks the whole dict.
        """
        if now - self._last_prune < _PRUNE_EVERY_SECONDS:
            return
        self._last_prune = now

        stale = [
            key
            for key, bucket in self._buckets.items()
            if not bucket or now - bucket[-1] > self.window_seconds
        ]
        for key in stale:
            del self._buckets[key]

    def _enforce_cap(self) -> None:
        """Keep the tracked-key count under the hard cap.

        This runs on every insert rather than only inside the throttled sweep:
        with a long window, nothing expires, and a flood of distinct keys would
        otherwise grow the dict without bound between sweeps.
        """
        overflow = len(self._buckets) - self.max_tracked_keys
        if overflow <= 0:
            return

        # Evict least-recently-active first.
        oldest = sorted(self._buckets, key=lambda key: self._buckets[key][-1])
        for key in oldest[:overflow]:
            del self._buckets[key]

    def check(self, keys: list[str]) -> bool:
        """Return ``True`` when all keys are under the limit, recording a hit."""
        if not keys:
            return True

        now = time.monotonic()
        with self._lock:
            self._sweep_expired(now)

            for key in keys:
                bucket = self._buckets.get(key)
                if not bucket:
                    continue
                while bucket and now - bucket[0] > self.window_seconds:
                    bucket.popleft()
                if len(bucket) >= self.max_events:
                    return False

            for key in keys:
                self._buckets.setdefault(key, deque()).append(now)
            self._enforce_cap()
            return True

    def reset(self, key: str) -> None:
        """Forget a key, e.g. after a successful login."""
        with self._lock:
            self._buckets.pop(key, None)

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._buckets)
