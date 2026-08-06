"""Input validation and token handling in the auth/messages routers."""

import datetime

import jwt
import pytest
from fastapi import HTTPException

from core.timeutils import to_utc_iso, utc_now
from routers import auth as auth_router
from routers import messages as messages_router


# --- usernames -------------------------------------------------------------

@pytest.mark.parametrize("username", ["bob", "a.b_c-1", "A" * 32])
def test_valid_usernames(username):
    assert auth_router._validate_username_or_400(username) == username


@pytest.mark.parametrize(
    "username",
    ["", "  ", "ab", "A" * 33, "with space", "emoji\U0001F600", "semi;colon", "sql'quote"],
)
def test_invalid_usernames(username):
    with pytest.raises(HTTPException) as exc:
        auth_router._validate_username_or_400(username)
    assert exc.value.status_code == 400


def test_username_is_trimmed():
    assert auth_router._validate_username_or_400("  bob  ") == "bob"


# --- passwords -------------------------------------------------------------

def test_password_minimum_length():
    with pytest.raises(HTTPException) as exc:
        auth_router._validate_password_or_400("short")
    assert "at least" in exc.value.detail


def test_password_rejects_common_choices():
    with pytest.raises(HTTPException, match="too common"):
        auth_router._validate_password_or_400("password")


def test_password_rejects_single_repeated_character():
    with pytest.raises(HTTPException, match="too common"):
        auth_router._validate_password_or_400("aaaaaaaaaa")


def test_password_rejects_over_bcrypt_limit():
    """bcrypt truncates past 72 bytes, so a silent accept would mislead."""
    with pytest.raises(HTTPException, match="too long"):
        auth_router._validate_password_or_400("x" * 200)


def test_password_accepts_a_reasonable_one():
    value = "correct horse battery"
    assert auth_router._validate_password_or_400(value) == value


# --- tokens ----------------------------------------------------------------

def _encode(payload):
    return jwt.encode(payload, auth_router.SECRET_KEY, algorithm=auth_router.ALGORITHM)


def test_verify_token_accepts_a_fresh_token():
    token = auth_router._issue_token("bob", 3)
    payload = auth_router.verify_token(token)
    assert payload["sub"] == "bob"
    assert payload["ver"] == 3


def test_verify_token_rejects_expired():
    token = _encode({"sub": "bob", "ver": 0, "exp": utc_now() - datetime.timedelta(hours=1)})
    with pytest.raises(HTTPException) as exc:
        auth_router.verify_token(token)
    assert exc.value.status_code == 401


def test_verify_token_rejects_token_without_exp():
    """Regression: a token minted with no `exp` would otherwise never expire."""
    token = _encode({"sub": "bob", "ver": 0})
    with pytest.raises(HTTPException) as exc:
        auth_router.verify_token(token)
    assert exc.value.status_code == 401


def test_verify_token_rejects_foreign_signature():
    token = jwt.encode({"sub": "bob", "ver": 0, "exp": utc_now()}, "other-key", algorithm="HS256")
    with pytest.raises(HTTPException):
        auth_router.verify_token(token)


def test_verify_token_rejects_alg_none():
    token = jwt.encode({"sub": "bob", "exp": utc_now()}, key="", algorithm="none")
    with pytest.raises(HTTPException):
        auth_router.verify_token(token)


def test_recovery_code_shape():
    for _ in range(50):
        code = auth_router._generate_recovery_code()
        assert len(code) == auth_router.RECOVERY_CODE_LENGTH
        assert code.isdigit()


def test_password_hash_roundtrip():
    hashed = auth_router._hash_secret("correct horse battery")
    assert auth_router._verify_secret("correct horse battery", hashed) is True
    assert auth_router._verify_secret("wrong", hashed) is False


def test_verify_secret_survives_malformed_hash():
    assert auth_router._verify_secret("x", "not-a-bcrypt-hash") is False


# --- GIF urls --------------------------------------------------------------

def test_gif_url_accepts_https():
    url = "https://media.giphy.com/media/abc/giphy.gif"
    assert messages_router._validate_gif_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "http://media.giphy.com/a.gif",       # plaintext
        "javascript:alert(1)",
        "data:image/gif;base64,AAAA",
        "https://user:pass@evil.example/a.gif",  # embedded credentials
        "https://",
        "",
        "https://x/" + "a" * 3000,            # oversized
    ],
)
def test_gif_url_rejects_everything_else(url):
    with pytest.raises(HTTPException) as exc:
        messages_router._validate_gif_url(url)
    assert exc.value.status_code == 400


# --- reactions -------------------------------------------------------------

def test_reaction_whitelist_accepts_known_emoji():
    for emoji in messages_router.ALLOWED_REACTIONS:
        assert messages_router._validate_reaction_emoji(emoji) == emoji


@pytest.mark.parametrize("value", ["", "   ", "hello", "\U0001F98A", "<script>"])
def test_reaction_whitelist_rejects_arbitrary_text(value):
    """The column used to accept 16 characters of anything."""
    with pytest.raises(HTTPException) as exc:
        messages_router._validate_reaction_emoji(value)
    assert exc.value.status_code == 400


# --- timestamps ------------------------------------------------------------

def test_to_utc_iso_marks_naive_values_as_utc():
    naive = datetime.datetime(2026, 3, 1, 12, 30, 0)
    assert to_utc_iso(naive) == "2026-03-01T12:30:00Z"


def test_to_utc_iso_converts_offsets():
    aware = datetime.datetime(
        2026, 3, 1, 15, 30, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=3))
    )
    assert to_utc_iso(aware) == "2026-03-01T12:30:00Z"


def test_utc_now_is_timezone_aware():
    assert utc_now().tzinfo is not None
