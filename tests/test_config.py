"""Shared config helpers, including the secret guard that used to be missing."""

import pytest

from core.config import (
    env_bool,
    env_positive_int,
    public_avatar,
    public_status,
    require_secret,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("1", True), ("true", True), ("YES", True), ("on", True),
     ("0", False), ("false", False), ("", False), ("maybe", False)],
)
def test_env_bool(monkeypatch, raw, expected):
    monkeypatch.setenv("DUCKAPP_TEST_FLAG", raw)
    assert env_bool("DUCKAPP_TEST_FLAG") is expected


def test_env_bool_uses_default_when_unset(monkeypatch):
    monkeypatch.delenv("DUCKAPP_TEST_FLAG", raising=False)
    assert env_bool("DUCKAPP_TEST_FLAG", True) is True


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("5", 5), (" 12 ", 12), ("0", 1), ("-3", 1), ("abc", 99), ("", 99)],
)
def test_env_positive_int(monkeypatch, raw, expected):
    monkeypatch.setenv("DUCKAPP_TEST_INT", raw)
    assert env_positive_int("DUCKAPP_TEST_INT", 99) == expected


def test_require_secret_rejects_missing(monkeypatch):
    monkeypatch.delenv("DUCKAPP_TEST_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="not set"):
        require_secret("DUCKAPP_TEST_SECRET")


@pytest.mark.parametrize("placeholder", ["None", "none", "changeme", "secret", "test"])
def test_require_secret_rejects_placeholders(monkeypatch, placeholder):
    """`str(os.getenv("JWT_KEY"))` used to yield the literal "None"."""
    monkeypatch.setenv("DUCKAPP_TEST_SECRET", placeholder)
    with pytest.raises(RuntimeError, match="placeholder"):
        require_secret("DUCKAPP_TEST_SECRET")


def test_require_secret_accepts_real_value(monkeypatch):
    monkeypatch.setenv("DUCKAPP_TEST_SECRET", "  s3cr3t-value  ")
    assert require_secret("DUCKAPP_TEST_SECRET") == "s3cr3t-value"


@pytest.mark.parametrize(
    "avatar",
    [
        "avatar_1.png",
        "avatar_10.png",
        "user_avatars/0123456789abcdef0123456789abcdef.png",
        "user_avatars/abc-def_12.jpeg",
    ],
)
def test_public_avatar_allows_known_names(avatar):
    assert public_avatar(avatar) == avatar


@pytest.mark.parametrize(
    "avatar",
    [
        None,
        "",
        "../../etc/passwd",
        "user_avatars/../../secret.png",
        "avatar_1.png.exe",
        "user_avatars/short.png",
        "http://evil.example/x.png",
        "avatar_100.png",
    ],
)
def test_public_avatar_rejects_anything_else(avatar):
    assert public_avatar(avatar) == "avatar_1.png"


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("online", "online"),
        ("ONLINE", "online"),
        ("dnd", "dnd"),
        # Invisible must be indistinguishable from offline to other users.
        ("invisible", "offline"),
        ("offline", "offline"),
        (None, "offline"),
        ("whatever", "offline"),
    ],
)
def test_public_status(status, expected):
    assert public_status(status) == expected
