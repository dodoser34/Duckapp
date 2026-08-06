"""The feedback board used to serve every report's full text to anyone."""

import datetime

import jwt
import pytest

from routers import feedback as feedback_router

ROW = {
    "id": 7,
    "nickname": "reporter",
    "problem_type": "security",
    "description": "The admin panel accepts a guessable code",
    "reproduction": "POST /api/feedback/admin/login with ...",
    "recommendation": "Use compare_digest",
    "status": "new",
    "created_at": datetime.datetime(2026, 3, 1, 10, 0, 0),
    "created_at_ms": 1772359200000,
}

SECRET_FIELDS = ("description", "reproduction", "recommendation")


def test_public_view_hides_free_text():
    public = feedback_router._serialize_feedback_row(ROW, include_details=False)

    for field in SECRET_FIELDS:
        assert field not in public

    serialized = str(public)
    assert "admin panel accepts" not in serialized
    assert "compare_digest" not in serialized


def test_public_view_keeps_the_board_useful():
    public = feedback_router._serialize_feedback_row(ROW, include_details=False)

    assert public["id"] == 7
    assert public["nickname"] == "reporter"
    assert public["problem_type"] == "security"
    assert public["status"] == "new"
    assert public["has_details"] is True


def test_admin_view_includes_everything():
    admin = feedback_router._serialize_feedback_row(ROW, include_details=True)

    for field in SECRET_FIELDS:
        assert admin[field] == ROW[field]


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ("new", "new"),
        ("APPROVED", "approved"),
        ("resolved", "resolved"),
        ("nonsense", "new"),
        (None, "new"),
    ],
)
def test_status_normalisation(stored, expected):
    row = {**ROW, "status": stored}
    assert feedback_router._serialize_feedback_row(row, False)["status"] == expected


# --- admin session ---------------------------------------------------------

class _FakeRequest:
    def __init__(self, cookies=None):
        self.cookies = cookies or {}


def _admin_token(**overrides):
    payload = {
        "scope": feedback_router.FEEDBACK_ADMIN_SCOPE,
        "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1),
        **overrides,
    }
    return jwt.encode(payload, feedback_router.FEEDBACK_ADMIN_TOKEN_SECRET, algorithm="HS256")


def test_no_cookie_is_not_admin():
    assert feedback_router._is_feedback_admin(_FakeRequest()) is False


def test_valid_token_is_admin():
    request = _FakeRequest({feedback_router.FEEDBACK_ADMIN_COOKIE_NAME: _admin_token()})
    assert feedback_router._is_feedback_admin(request) is True


def test_user_session_token_is_not_admin():
    """A normal login token must not unlock moderation, despite sharing a key."""
    token = jwt.encode(
        {"sub": "bob", "ver": 0, "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1)},
        feedback_router.FEEDBACK_ADMIN_TOKEN_SECRET,
        algorithm="HS256",
    )
    request = _FakeRequest({feedback_router.FEEDBACK_ADMIN_COOKIE_NAME: token})
    assert feedback_router._is_feedback_admin(request) is False


def test_expired_admin_token_is_rejected():
    token = _admin_token(exp=datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=1))
    request = _FakeRequest({feedback_router.FEEDBACK_ADMIN_COOKIE_NAME: token})
    assert feedback_router._is_feedback_admin(request) is False


def test_wrong_scope_is_rejected():
    token = _admin_token(scope="something_else")
    request = _FakeRequest({feedback_router.FEEDBACK_ADMIN_COOKIE_NAME: token})
    assert feedback_router._is_feedback_admin(request) is False


def test_foreign_signature_is_rejected():
    token = jwt.encode(
        {"scope": feedback_router.FEEDBACK_ADMIN_SCOPE,
         "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1)},
        "attacker-key",
        algorithm="HS256",
    )
    request = _FakeRequest({feedback_router.FEEDBACK_ADMIN_COOKIE_NAME: token})
    assert feedback_router._is_feedback_admin(request) is False
