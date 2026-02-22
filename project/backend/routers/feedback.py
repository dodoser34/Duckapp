import asyncio
import datetime
from typing import Literal

import pymysql
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from databases.db_manager import get_connection

router = APIRouter(prefix="/api", tags=["feedback"])

ALLOWED_PROBLEM_TYPES = {"bug", "ui", "performance", "security", "other"}


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


def _to_utc_iso(value):
    if not isinstance(value, datetime.datetime):
        return str(value)
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


@router.post("/feedback")
async def submit_feedback(payload: FeedbackCreate):
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
                        recommendation
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        payload.nickname,
                        payload.problem_type,
                        payload.description,
                        payload.reproduction,
                        payload.recommendation,
                    ),
                )
                feedback_id = cursor.lastrowid
                conn.commit()
                cursor.execute(
                    """
                    SELECT
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM site_feedback
                    WHERE id = %s
                    """,
                    (feedback_id,),
                )
                created_row = cursor.fetchone() or {}
                created = created_row.get("created_at")
                return {
                    "id": feedback_id,
                    "nickname": payload.nickname,
                    "problem_type": payload.problem_type,
                    "description": payload.description,
                    "reproduction": payload.reproduction,
                    "recommendation": payload.recommendation,
                    "created_at": _to_utc_iso(created),
                    "created_at_ms": created_row.get("created_at_ms"),
                }
        finally:
            conn.close()

    try:
        feedback = await asyncio.to_thread(insert_feedback)
    except pymysql.MySQLError:
        raise HTTPException(status_code=500, detail="Could not save feedback")

    return {"ok": True, "message": "Feedback received", "feedback": feedback}


@router.get("/feedback")
async def list_feedback(limit: int = 50):
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
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM site_feedback
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (safe_limit,),
                )
                rows = cursor.fetchall() or []
                result = []
                for row in rows:
                    created = row.get("created_at")
                    result.append(
                        {
                            "id": row.get("id"),
                            "nickname": row.get("nickname"),
                            "problem_type": row.get("problem_type"),
                            "description": row.get("description"),
                            "reproduction": row.get("reproduction"),
                            "recommendation": row.get("recommendation"),
                            "created_at": _to_utc_iso(created),
                            "created_at_ms": row.get("created_at_ms"),
                        }
                    )
                return result
        finally:
            conn.close()

    try:
        return await asyncio.to_thread(fetch_feedback)
    except pymysql.MySQLError:
        raise HTTPException(status_code=500, detail="Could not load feedback")
