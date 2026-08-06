import asyncio
import datetime
import os
import secrets
from typing import Literal

import jwt
import pymysql
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

from core.config import env_bool, env_positive_int, require_secret
from core.logging_config import get_logger
from core.ratelimit import RateLimiter
from core.timeutils import to_utc_iso, utc_now
from core.web import client_ip
from databases import db_manager as db

router = APIRouter(prefix="/api", tags=["feedback"])
log = get_logger("feedback")

ALLOWED_PROBLEM_TYPES = {"bug", "ui", "performance", "security", "other"}
ALLOWED_FEEDBACK_STATUSES = {
    "new",
    "attention",
    "rejected_not_enough_info",
    "approved",
    "resolved",
}

FEEDBACK_ADMIN_COOKIE_NAME = "duckapp_feedback_admin"
FEEDBACK_ADMIN_TOKEN_ALGORITHM = "HS256"
FEEDBACK_ADMIN_SCOPE = "feedback_admin"

_write_limiter = RateLimiter(600, env_positive_int("DUCKAPP_FEEDBACK_WRITE_MAX", 20))
_read_limiter = RateLimiter(60, env_positive_int("DUCKAPP_FEEDBACK_READ_MAX", 60))
_admin_login_limiter = RateLimiter(
    600, env_positive_int("DUCKAPP_FEEDBACK_ADMIN_LOGIN_MAX", 10)
)

FEEDBACK_ADMIN_CODE = (os.getenv("DUCKAPP_FEEDBACK_ADMIN_CODE") or "").strip()
if FEEDBACK_ADMIN_CODE and len(FEEDBACK_ADMIN_CODE) < 16:
    log.warning(
        "DUCKAPP_FEEDBACK_ADMIN_CODE is shorter than 16 characters; "
        "it is the only thing protecting the feedback admin panel"
    )

FEEDBACK_ADMIN_TOKEN_SECRET = require_secret("JWT_KEY")
FEEDBACK_ADMIN_TOKEN_TTL_SECONDS = env_positive_int(
    "DUCKAPP_FEEDBACK_ADMIN_TOKEN_TTL_SECONDS", 8 * 60 * 60
)
FEEDBACK_ADMIN_COOKIE_PATH = (os.getenv("DUCKAPP_COOKIE_PATH") or "/").strip() or "/"
FEEDBACK_ADMIN_COOKIE_DOMAIN = (os.getenv("DUCKAPP_COOKIE_DOMAIN") or "").strip() or None
FEEDBACK_ADMIN_SECURE_COOKIE = env_bool("DUCKAPP_SECURE_COOKIES", False)
_SAMESITE_RAW = (os.getenv("DUCKAPP_COOKIE_SAMESITE") or "lax").strip().lower()
FEEDBACK_ADMIN_COOKIE_SAMESITE = _SAMESITE_RAW if _SAMESITE_RAW in {"lax", "strict", "none"} else "lax"
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


def _normalize_feedback_status(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_FEEDBACK_STATUSES else "new"


def _serialize_feedback_row(row: dict, include_details: bool) -> dict:
    """Project a feedback row for the requester.

    Anonymous visitors get the public board view. The free-text fields stay
    admin-only: a report filed under ``security`` spells out how to attack the
    site, and the old endpoint served all of it to anyone who asked.
    """
    public = {
        "id": row.get("id"),
        "nickname": row.get("nickname"),
        "problem_type": row.get("problem_type"),
        "status": _normalize_feedback_status(row.get("status")),
        "created_at": to_utc_iso(row.get("created_at")),
        "created_at_ms": row.get("created_at_ms"),
        "has_details": True,
    }
    if not include_details:
        return public

    return {
        **public,
        "description": row.get("description"),
        "reproduction": row.get("reproduction"),
        "recommendation": row.get("recommendation"),
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


def _is_feedback_admin(request: Request) -> bool:
    token = request.cookies.get(FEEDBACK_ADMIN_COOKIE_NAME)
    if not token:
        return False

    try:
        payload = jwt.decode(
            token,
            FEEDBACK_ADMIN_TOKEN_SECRET,
            algorithms=[FEEDBACK_ADMIN_TOKEN_ALGORITHM],
            options={"require": ["exp", "scope"]},
        )
    except jwt.PyJWTError:
        return False

    return payload.get("scope") == FEEDBACK_ADMIN_SCOPE


def _require_feedback_admin(request: Request) -> None:
    if not _is_feedback_admin(request):
        raise HTTPException(status_code=401, detail="Admin authentication required")


def _enforce_limit(limiter: RateLimiter, request: Request, action: str) -> None:
    if not limiter.check([f"{action}:{client_ip(request)}"]):
        raise HTTPException(status_code=429, detail="Too many feedback requests")


@router.post("/feedback")
async def submit_feedback(payload: FeedbackCreate, request: Request):
    _enforce_limit(_write_limiter, request, "feedback_write")

    def insert_feedback():
        with db.transaction() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO site_feedback (
                    nickname, problem_type, description, reproduction, recommendation, status
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
            return cursor.lastrowid

    try:
        feedback_id = await asyncio.to_thread(insert_feedback)
    except (pymysql.MySQLError, TimeoutError):
        log.error("Could not save feedback", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not save feedback") from None

    log.info("Feedback #%s received (%s)", feedback_id, payload.problem_type)
    # The submitter already knows what they wrote; echoing it back is enough.
    return {
        "ok": True,
        "message": "Feedback received",
        "feedback": {"id": feedback_id, "status": "new"},
    }


@router.get("/feedback")
async def list_feedback(request: Request, limit: int = 50):
    _enforce_limit(_read_limiter, request, "feedback_read")
    safe_limit = max(1, min(int(limit or 50), 200))
    include_details = _is_feedback_admin(request)

    def fetch_feedback():
        with db.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        id, nickname, problem_type, description, reproduction,
                        recommendation, status, created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM site_feedback
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (safe_limit,),
                )
                return cursor.fetchall() or []

    try:
        rows = await asyncio.to_thread(fetch_feedback)
    except (pymysql.MySQLError, TimeoutError):
        log.error("Could not load feedback", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not load feedback") from None

    return {
        "is_admin": include_details,
        "items": [_serialize_feedback_row(row, include_details) for row in rows],
    }


@router.get("/feedback/admin/session")
async def feedback_admin_session(request: Request):
    return {"ok": True, "is_admin": _is_feedback_admin(request)}


@router.post("/feedback/admin/login")
async def feedback_admin_login(payload: FeedbackAdminLogin, request: Request, response: Response):
    _enforce_limit(_admin_login_limiter, request, "feedback_admin_login")

    if not FEEDBACK_ADMIN_CODE:
        raise HTTPException(status_code=503, detail="Feedback admin code is not configured")

    # compare_digest keeps the check constant-time; ``!=`` leaked the length of
    # the matching prefix through response timing.
    if not secrets.compare_digest(payload.code, FEEDBACK_ADMIN_CODE):
        log.warning("Rejected feedback admin login from %s", client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid admin code")

    token = jwt.encode(
        {
            "scope": FEEDBACK_ADMIN_SCOPE,
            "iat": utc_now(),
            "exp": utc_now() + datetime.timedelta(seconds=FEEDBACK_ADMIN_TOKEN_TTL_SECONDS),
        },
        FEEDBACK_ADMIN_TOKEN_SECRET,
        algorithm=FEEDBACK_ADMIN_TOKEN_ALGORITHM,
    )
    _set_feedback_admin_cookie(response, token)
    log.info("Feedback admin signed in from %s", client_ip(request))
    return {"ok": True, "is_admin": True}


@router.post("/feedback/admin/logout")
async def feedback_admin_logout(response: Response):
    _delete_feedback_admin_cookie(response)
    return {"ok": True}


@router.patch("/feedback/{feedback_id}/status")
async def update_feedback_status(feedback_id: int, payload: FeedbackStatusUpdate, request: Request):
    _enforce_limit(_write_limiter, request, "feedback_admin_update")
    _require_feedback_admin(request)

    def update_status():
        with db.transaction() as (conn, cursor):
            cursor.execute(
                "UPDATE site_feedback SET status = %s WHERE id = %s",
                (payload.status, feedback_id),
            )
            if cursor.rowcount == 0:
                cursor.execute("SELECT id FROM site_feedback WHERE id = %s", (feedback_id,))
                if not cursor.fetchone():
                    raise LookupError("Feedback not found")

            cursor.execute(
                """
                SELECT
                    id, nickname, problem_type, description, reproduction,
                    recommendation, status, created_at,
                    CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                FROM site_feedback
                WHERE id = %s
                """,
                (feedback_id,),
            )
            return cursor.fetchone() or {}

    try:
        row = await asyncio.to_thread(update_status)
    except LookupError:
        raise HTTPException(status_code=404, detail="Feedback request not found") from None
    except (pymysql.MySQLError, TimeoutError):
        log.error("Could not update feedback %s", feedback_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not update feedback status") from None

    log.info("Feedback #%s status set to %s", feedback_id, payload.status)
    return {"ok": True, "feedback": _serialize_feedback_row(row, include_details=True)}
