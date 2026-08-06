"""Rate limiter: the bug here was unbounded memory growth."""

import time

import pytest

from core.ratelimit import RateLimiter


def test_allows_up_to_the_limit_then_blocks():
    limiter = RateLimiter(window_seconds=60, max_events=3)

    assert limiter.check(["ip:1.2.3.4"]) is True
    assert limiter.check(["ip:1.2.3.4"]) is True
    assert limiter.check(["ip:1.2.3.4"]) is True
    assert limiter.check(["ip:1.2.3.4"]) is False


def test_keys_are_independent():
    limiter = RateLimiter(window_seconds=60, max_events=1)

    assert limiter.check(["ip:1.1.1.1"]) is True
    assert limiter.check(["ip:2.2.2.2"]) is True
    assert limiter.check(["ip:1.1.1.1"]) is False


def test_any_exceeded_key_blocks_the_whole_request():
    limiter = RateLimiter(window_seconds=60, max_events=1)
    limiter.check(["user:bob"])

    # Fresh IP, but the username budget is already spent.
    assert limiter.check(["ip:9.9.9.9", "user:bob"]) is False


def test_window_expiry_frees_the_budget(monkeypatch):
    limiter = RateLimiter(window_seconds=1, max_events=1)
    clock = [1000.0]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])

    assert limiter.check(["ip:1.1.1.1"]) is True
    assert limiter.check(["ip:1.1.1.1"]) is False

    clock[0] += 2.0
    assert limiter.check(["ip:1.1.1.1"]) is True


def test_reset_clears_a_single_key():
    limiter = RateLimiter(window_seconds=60, max_events=1)
    limiter.check(["user:alice"])
    assert limiter.check(["user:alice"]) is False

    limiter.reset("user:alice")
    assert limiter.check(["user:alice"]) is True


def test_stale_buckets_are_evicted(monkeypatch):
    """Regression: probing distinct usernames used to grow the dict forever."""
    limiter = RateLimiter(window_seconds=10, max_events=5)
    clock = [1000.0]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])

    for i in range(500):
        limiter.check([f"user:probe-{i}"])
    assert limiter.tracked_keys() == 500

    # Move past both the window and the prune interval.
    clock[0] += 120.0
    limiter.check(["user:someone-else"])

    assert limiter.tracked_keys() == 1


def test_tracked_keys_are_hard_capped(monkeypatch):
    limiter = RateLimiter(window_seconds=3600, max_events=5, max_tracked_keys=50)
    clock = [1000.0]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])

    for i in range(400):
        clock[0] += 1.0
        limiter.check([f"user:{i}"])

    # Nothing has expired (window is an hour), so only the cap can hold it down.
    assert limiter.tracked_keys() <= 50


@pytest.mark.parametrize("keys", [[], None])
def test_empty_key_list_is_allowed(keys):
    limiter = RateLimiter(window_seconds=60, max_events=1)
    assert limiter.check(keys or []) is True
