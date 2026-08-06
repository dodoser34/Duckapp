"""Middleware and static-mount behaviour, exercised without touching MySQL.

TestClient only runs the lifespan (and therefore `init_db`) inside a `with`
block, so building the client directly keeps these tests offline.
"""

import pytest
from fastapi.testclient import TestClient

import start_app

GOOD_ORIGIN = "http://localhost:8000"


@pytest.fixture(scope="module")
def client():
    return TestClient(start_app.app, base_url="http://localhost:8000")


# --- security headers ------------------------------------------------------

def test_security_headers_are_present(client):
    response = client.get("/js/api.js")
    headers = response.headers

    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert "object-src 'none'" in headers["Content-Security-Policy"]
    assert "form-action 'self'" in headers["Content-Security-Policy"]


# --- CSRF ------------------------------------------------------------------

def test_unsafe_request_from_foreign_origin_is_blocked(client):
    response = client.post(
        "/api/feedback",
        json={},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid request origin"


def test_unsafe_request_without_origin_is_blocked(client):
    """Regression: this used to be allowed through by default."""
    response = client.post("/api/feedback", json={})
    assert response.status_code == 403
    assert response.json()["detail"] == "Missing request origin"


def test_referer_is_accepted_when_origin_is_absent(client):
    response = client.post(
        "/api/feedback",
        json={},
        headers={"Referer": f"{GOOD_ORIGIN}/html/main-window-frame.html"},
    )
    # Passes CSRF, then fails body validation - which is the point.
    assert response.status_code == 422


def test_same_origin_request_reaches_the_endpoint(client):
    response = client.post("/api/feedback", json={}, headers={"Origin": GOOD_ORIGIN})
    assert response.status_code == 422


def test_origin_regex_is_anchored(client):
    """`http://localhost.evil.example` must not match the localhost pattern."""
    response = client.post(
        "/api/feedback",
        json={},
        headers={"Origin": "http://localhost.evil.example"},
    )
    assert response.status_code == 403


def test_safe_methods_skip_the_origin_check(client):
    response = client.get("/api/messages/1", headers={"Origin": "https://evil.example"})
    # Rejected for lack of a session, not for its origin.
    assert response.status_code == 401


# --- static mounts ---------------------------------------------------------

@pytest.mark.parametrize(
    "path",
    [
        "/js/api.js",
        "/js/shared/peer.js",
        "/styles/base/chat.css",
        "/lang/en.json",
        "/emoji/emoji.json",
        "/html/main-chat.html",
        "/assets/avatar_1.png",
    ],
)
def test_frontend_assets_are_served(client, path):
    """Only /assets was mounted before, so served pages loaded no JS or CSS."""
    assert client.get(path).status_code == 200


def test_relative_paths_from_a_served_page_resolve():
    """`../js/x.js` from /html/... must land on the /js mount."""
    from urllib.parse import urljoin

    page = "http://localhost:8000/html/main-chat.html"
    assert urljoin(page, "../js/chat/chat-logic.js") == "http://localhost:8000/js/chat/chat-logic.js"
    assert urljoin(page, "../styles/base/chat.css") == "http://localhost:8000/styles/base/chat.css"
    assert urljoin(page, "../../lang/en.json") == "http://localhost:8000/lang/en.json"
    assert urljoin(page, "../../emoji/emoji.json") == "http://localhost:8000/emoji/emoji.json"


def test_root_redirects_to_the_landing_page(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/html/main-window-frame.html"


def test_legacy_login_url_redirects(client):
    response = client.get("/api/auth/login", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/html/authorization-frame.html"


def test_chat_url_redirects_anonymous_visitors_to_login(client):
    response = client.get("/api/auth/chat", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/html/authorization-frame.html"


# --- host filtering --------------------------------------------------------

def test_unknown_host_is_rejected(client):
    response = client.get("/js/api.js", headers={"Host": "evil.example"})
    assert response.status_code == 400


# --- auth gate -------------------------------------------------------------

@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/auth/me"),
        ("GET", "/api/auth/check"),
        ("GET", "/api/friends/list"),
        ("GET", "/api/friends/requests/incoming"),
        ("GET", "/api/messages/1"),
        ("GET", "/api/users/profile/avatar/history"),
    ],
)
def test_protected_endpoints_require_a_session(client, method, path):
    assert client.request(method, path).status_code == 401


def test_feedback_status_change_requires_admin(client):
    response = client.patch(
        "/api/feedback/1/status",
        json={"status": "approved"},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert response.status_code == 401
