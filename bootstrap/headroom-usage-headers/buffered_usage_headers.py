"""Usage-header snapshots for Headroom's buffered Anthropic responses."""

from __future__ import annotations

import hashlib
import math
import time
from collections import OrderedDict
from collections.abc import Mapping
from typing import Any

PREFIX = "anthropic-ratelimit-unified-"
MAX_AGE_SECONDS = 1800
MAX_ACCOUNTS = 128


class BufferedUsageHeaders:
    """Capture current headers, with an account-scoped last-known fallback.

    Only utilization/reset pairs are forwarded. Replaying old rejection or
    overage flags could incorrectly block a request. Credentials are never
    persisted, logged, or forwarded here; only a digest keys the memory cache.
    """

    def __init__(self, proxy: Any, url: str, headers: Mapping[str, str]):
        self.started_at = time.monotonic()
        self.current: tuple[float, float, dict[str, str]] | None = None
        normalized = {key.lower(): value for key, value in headers.items()}
        credentials = [
            normalized.get("authorization", ""),
            normalized.get("x-api-key", ""),
        ]
        self.key = (
            hashlib.sha256(repr((url, *credentials)).encode()).digest()
            if any(credentials)
            else None
        )
        cache = getattr(proxy, "_buffered_usage_header_cache", None)
        if cache is None:
            cache = OrderedDict()
            proxy._buffered_usage_header_cache = cache
        self.cache = cache

    def capture(self, response: Any) -> None:
        if response.status_code != 200:
            return
        headers = {key.lower(): value for key, value in response.headers.items()}
        values = {}
        for window in ("5h", "7d"):
            utilization = PREFIX + window + "-utilization"
            reset = PREFIX + window + "-reset"
            if utilization in headers and reset in headers:
                values[utilization] = headers[utilization]
                values[reset] = headers[reset]
        self.current = (self.started_at, time.monotonic(), values)
        if self.key is not None:
            previous = self.cache.get(self.key)
            # A slower, older request must not replace a newer reading.
            if previous is None or previous[0] <= self.started_at:
                self.cache[self.key] = self.current
                self.cache.move_to_end(self.key)
                while len(self.cache) > MAX_ACCOUNTS:
                    self.cache.popitem(last=False)

    def headers(self) -> list[tuple[bytes, bytes]]:
        snapshot = self.current
        if snapshot is None and self.key is not None:
            snapshot = self.cache.get(self.key)
        if snapshot is None or time.monotonic() - snapshot[1] > MAX_AGE_SECONDS:
            return []
        result = []
        now = time.time()
        for window in ("5h", "7d"):
            utilization = PREFIX + window + "-utilization"
            reset = PREFIX + window + "-reset"
            try:
                used = float(snapshot[2][utilization])
                resets_at = float(snapshot[2][reset])
            except (KeyError, TypeError, ValueError):
                continue
            if (
                not math.isfinite(used)
                or not 0 <= used <= 1
                or not math.isfinite(resets_at)
                or not now < resets_at < now + 31536000
            ):
                continue
            # Re-encode validated numbers, never arbitrary upstream strings.
            result.extend(
                [
                    (utilization.encode("ascii"), str(used).encode("ascii")),
                    (reset.encode("ascii"), str(resets_at).encode("ascii")),
                ]
            )
        return result
