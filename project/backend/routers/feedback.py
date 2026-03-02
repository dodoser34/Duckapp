import asyncio
import datetime
import os
import time
from collections import deque
from threading import Lock
from typing import Literal

import jwt
import pymysql
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

from databases.db_manager import get_connection

router = APIRouter(prefix="/api", tags=["feedback"])

ALLOWED_PROBLEM_TYPES = {"bug", "ui", "performance", "security", "other"}
ALLOWED_FEEDBACK_STATUSES = {
    "new",
    "attention",
    "rejected_not_enough_info",
    "approved",
    "resolved",
}
FEEDBACK_WRITE_WINDOW_SECONDS = 600
FEEDBACK_READ_WINDOW_SECONDS = 60
FEEDBACK_ADMIN_LOGIN_WINDOW_SECONDS = 600
FEEDBACK_ADMIN_COOKIE_NAME = "duckapp_feedback_admin"
FEEDBACK_ADMIN_TOKEN_ALGORITHM = "HS256"
_FEEDBACK_RATE_BUCKETS: dict[str, deque[float]] = {}
_FEEDBACK_RATE_LOCK = Lock()


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return max(1, value)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


FEEDBACK_WRITE_MAX_REQUESTS = _env_positive_int("DUCKAPP_FEEDBACK_WRITE_MAX", 20)
FEEDBACK_READ_MAX_REQUESTS = _env_positive_int("DUCKAPP_FEEDBACK_READ_MAX", 60)
FEEDBACK_ADMIN_LOGIN_MAX_REQUESTS = _env_positive_int("DUCKAPP_FEEDBACK_ADMIN_LOGIN_MAX", 20)
FEEDBACK_TRUST_PROXY_HEADERS = _env_bool("DUCKAPP_TRUST_PROXY_HEADERS", False)
FEEDBACK_ADMIN_CODE = (os.getenv("DUCKAPP_FEEDBACK_ADMIN_CODE") or "").strip()
FEEDBACK_ADMIN_TOKEN_SECRET = (os.getenv("JWT_KEY") or "").strip()
FEEDBACK_ADMIN_TOKEN_TTL_SECONDS = _env_positive_int(
    "DUCKAPP_FEEDBACK_ADMIN_TOKEN_TTL_SECONDS",
    8 * 60 * 60,
)
FEEDBACK_ADMIN_COOKIE_PATH = (os.getenv("DUCKAPP_COOKIE_PATH") or "/").strip() or "/"
FEEDBACK_ADMIN_COOKIE_DOMAIN = (os.getenv("DUCKAPP_COOKIE_DOMAIN") or "").strip() or None
FEEDBACK_ADMIN_SECURE_COOKIE = _env_bool("DUCKAPP_SECURE_COOKIES", False)
_FEEDBACK_ADMIN_COOKIE_SAMESITE_RAW = (os.getenv("DUCKAPP_COOKIE_SAMESITE") or "lax").strip().lower()
FEEDBACK_ADMIN_COOKIE_SAMESITE = (
    _FEEDBACK_ADMIN_COOKIE_SAMESITE_RAW
    if _FEEDBACK_ADMIN_COOKIE_SAMESITE_RAW in {"lax", "strict", "none"}
    else "lax"
)
if FEEDBACK_ADMIN_COOKIE_SAMESITE == "none" and not FEEDBACK_ADMIN_SECURE_COOKIE:
    FEEDBACK_ADMIN_COOKIE_SAMESITE = "lax"


class FeedbackCreate(BaseModel):
    nickname: str
    problem_type: Literal["bug", "ui", "performance", "security", "other"]
    description: str
    reproduction: str
    recommendation: str

    @field_validator("nickname", "description", "reproduction", "recommendation", mode="before")
    @classmethod
    def validate_text_fields(cls, value):
        text = str(value or "").strip()
        if not text:
            raise ValueError("Field must not be empty")
        return text

    @field_validator("nickname")
    @classmethod
    def validate_nickname_length(cls, value: str):
        if len(value) > 30:
            raise ValueError("Nickname is too long")
        return value

    @field_validator("description", "reproduction", "recommendation")
    @classmethod
    def validate_long_fields(cls, value: str):
        if len(value) > 2000:
            raise ValueError("Field is too long")
        return value

    @field_validator("problem_type", mode="before")
    @classmethod
    def validate_problem_type(cls, value):
        normalized = str(value or "").strip().lower()
        if normalized not in ALLOWED_PROBLEM_TYPES:
            raise ValueError("Invalid problem type")
        return normalized


class FeedbackAdminLogin(BaseModel):
    code: str

    @field_validator("code", mode="before")
    @classmethod
    def validate_admin_code(cls, value):
        text = str(value or "").strip()
        if not text:
            raise ValueError("Code is required")
        if len(text) > 512:
            raise ValueError("Code is too long")
        return text


class FeedbackStatusUpdate(BaseModel):
    status: str

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value):
        normalized = str(value or "").strip().lower()
        if normalized not in ALLOWED_FEEDBACK_STATUSES:
            raise ValueError("Invalid feedback status")
        return normalized


def _to_utc_iso(value):
    if not isinstance(value, datetime.datetime):
        return str(value)
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_feedback_status(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in ALLOWED_FEEDBACK_STATUSES:
        return normalized
    return "new"


def _serialize_feedback_row(row: dict) -> dict:
    created = row.get("created_at")
    return {
        "id": row.get("id"),
        "nickname": row.get("nickname"),
        "problem_type": row.get("problem_type"),
        "description": row.get("description"),
        "reproduction": row.get("reproduction"),
        "recommendation": row.get("recommendation"),
        "status": _normalize_feedback_status(row.get("status")),
        "created_at": _to_utc_iso(created),
        "created_at_ms": row.get("created_at_ms"),
    }


def _set_feedback_admin_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=FEEDBACK_ADMIN_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=FEEDBACK_ADMIN_TOKEN_TTL_SECONDS,
        expires=FEEDBACK_ADMIN_TOKEN_TTL_SECONDS,
        samesite=FEEDBACK_ADMIN_COOKIE_SAMESITE,
        secure=FEEDBACK_ADMIN_SECURE_COOKIE,
        path=FEEDBACK_ADMIN_COOKIE_PATH,
        domain=FEEDBACK_ADMIN_COOKIE_DOMAIN,
    )


def _delete_feedback_admin_cookie(response: Response) -> None:
    response.delete_cookie(
        key=FEEDBACK_ADMIN_COOKIE_NAME,
        path=FEEDBACK_ADMIN_COOKIE_PATH,
        domain=FEEDBACK_ADMIN_COOKIE_DOMAIN,
        httponly=True,
        samesite=FEEDBACK_ADMIN_COOKIE_SAMESITE,
        secure=FEEDBACK_ADMIN_SECURE_COOKIE,
    )


def _require_feedback_admin(request: Request) -> None:
    if not FEEDBACK_ADMIN_TOKEN_SECRET:
        raise HTTPException(status_code=503, detail="Admin auth secret is not configured")

    token = request.cookies.get(FEEDBACK_ADMIN_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    try:
        payload = jwt.decode(
            token,
            FEEDBACK_ADMIN_TOKEN_SECRET,
            algorithms=[FEEDBACK_ADMIN_TOKEN_ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Admin session has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Admin session is invalid")

    if payload.get("scope") != "feedback_admin":
        raise HTTPException(status_code=401, detail="Admin session is invalid")


def _client_ip(request: Request) -> str:
    if FEEDBACK_TRUST_PROXY_HEADERS:
        forwarded_for = (request.headers.get("x-forwarded-for") or "").strip()
        if forwarded_for:
            return forwarded_for.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _enforce_feedback_rate_limit(
    request: Request, action: str, window_seconds: int, max_requests: int
) -> None:
    if max_requests <= 0 or window_seconds <= 0:
        return

    now = time.monotonic()
    key = f"{action}:{_client_ip(request)}"

    with _FEEDBACK_RATE_LOCK:
        bucket = _FEEDBACK_RATE_BUCKETS.setdefault(key, deque())
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_requests:
            raise HTTPException(status_code=429, detail="Too many feedback requests")
        bucket.append(now)


@router.post("/feedback")
async def submit_feedback(payload: FeedbackCreate, request: Request):
    _enforce_feedback_rate_limit(
        request,
        action="feedback_write",
        window_seconds=FEEDBACK_WRITE_WINDOW_SECONDS,
        max_requests=FEEDBACK_WRITE_MAX_REQUESTS,
    )

    def insert_feedback():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO site_feedback (
                        nickname,
                        problem_type,
                        description,
                        reproduction,
                        recommendation,
                        status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        payload.nickname,
                        payload.problem_type,
                        payload.description,
                        payload.reproduction,
                        payload.recommendation,
                        "new",
                    ),
                )
                feedback_id = cursor.lastrowid
                conn.commit()
                cursor.execute(
                    """
                    SELECT
                        id,
                        nickname,
                        problem_type,
                        description,
                        reproduction,
                        recommendation,
                        status,
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM site_feedback
                    WHERE id = %s
                    """,
                    (feedback_id,),
                )
                row = cursor.fetchone() or {}
                return _serialize_feedback_row(row)
        finally:
            conn.close()

    try:
        feedback = await asyncio.to_thread(insert_feedback)
    except pymysql.MySQLError:
        raise HTTPException(status_code=500, detail="Could not save feedback")

    return {"ok": True, "message": "Feedback received", "feedback": feedback}


@router.get("/feedback")
async def list_feedback(request: Request, limit: int = 50):
    _enforce_feedback_rate_limit(
        request,
        action="feedback_read",
        window_seconds=FEEDBACK_READ_WINDOW_SECONDS,
        max_requests=FEEDBACK_READ_MAX_REQUESTS,
    )
    safe_limit = max(1, min(int(limit or 50), 200))

    def fetch_feedback():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        id,
                        nickname,
                        problem_type,
                        description,
                        reproduction,
                        recommendation,
                        status,
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM site_feedback
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (safe_limit,),
                )
                rows = cursor.fetchall() or []
                return [_serialize_feedback_row(row) for row in rows]
        finally:
            conn.close()

    try:
        return await asyncio.to_thread(fetch_feedback)
    except pymysql.MySQLError:
        raise HTTPException(status_code=500, detail="Could not load feedback")


@router.get("/feedback/admin/session")
async def feedback_admin_session(request: Request):
    try:
        _require_feedback_admin(request)
    except HTTPException as exc:
        if exc.status_code == 401:
            return {"ok": True, "is_admin": False}
        raise
    return {"ok": True, "is_admin": True}


@router.post("/feedback/admin/login")
async def feedback_admin_login(payload: FeedbackAdminLogin, request: Request, response: Response):
    _enforce_feedback_rate_limit(
        request,
        action="feedback_admin_login",
        window_seconds=FEEDBACK_ADMIN_LOGIN_WINDOW_SECONDS,
        max_requests=FEEDBACK_ADMIN_LOGIN_MAX_REQUESTS,
    )

    if not FEEDBACK_ADMIN_CODE:
        raise HTTPException(status_code=503, detail="Feedback admin code is not configured")

    if payload.code != FEEDBACK_ADMIN_CODE:
        raise HTTPException(status_code=401, detail="Invalid admin code")

    if not FEEDBACK_ADMIN_TOKEN_SECRET:
        raise HTTPException(status_code=503, detail="Admin auth secret is not configured")

    token_payload = {
        "scope": "feedback_admin",
        "exp": datetime.datetime.utcnow()
        + datetime.timedelta(seconds=FEEDBACK_ADMIN_TOKEN_TTL_SECONDS),
    }
    token = jwt.encode(
        token_payload,
        FEEDBACK_ADMIN_TOKEN_SECRET,
        algorithm=FEEDBACK_ADMIN_TOKEN_ALGORITHM,
    )
    _set_feedback_admin_cookie(response, token)
    return {"ok": True, "is_admin": True}


@router.post("/feedback/admin/logout")
async def feedback_admin_logout(response: Response):
    _delete_feedback_admin_cookie(response)
    return {"ok": True}


@router.patch("/feedback/{feedback_id}/status")
async def update_feedback_status(feedback_id: int, payload: FeedbackStatusUpdate, request: Request):
    _enforce_feedback_rate_limit(
        request,
        action="feedback_admin_update",
        window_seconds=FEEDBACK_WRITE_WINDOW_SECONDS,
        max_requests=FEEDBACK_WRITE_MAX_REQUESTS,
    )
    _require_feedback_admin(request)

    def update_status():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id FROM site_feedback WHERE id = %s", (feedback_id,))
                if not cursor.fetchone():
                    raise LookupError("Feedback not found")

                cursor.execute(
                    "UPDATE site_feedback SET status = %s WHERE id = %s",
                    (payload.status, feedback_id),
                )

                conn.commit()
                cursor.execute(
                    """
                    SELECT
                        id,
                        nickname,
                        problem_type,
                        description,
                        reproduction,
                        recommendation,
                        status,
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM site_feedback
                    WHERE id = %s
                    """,
                    (feedback_id,),
                )
                row = cursor.fetchone() or {}
                return _serialize_feedback_row(row)
        finally:
            conn.close()

    try:
        feedback = await asyncio.to_thread(update_status)
    except LookupError:
        raise HTTPException(status_code=404, detail="Feedback request not found")
    except pymysql.MySQLError:
        raise HTTPException(status_code=500, detail="Could not update feedback status")

    return {"ok": True, "feedback": feedback}
