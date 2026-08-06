import asyncio
import datetime

import pymysql
from fastapi import APIRouter, HTTPException

from core.logging_config import get_logger
from core.timeutils import utc_now_naive
from databases import db_manager as db

router = APIRouter(prefix="/api", tags=["common"])
log = get_logger("common")

HEARTBEAT_SERVICE_NAME = "backend"
UPTIME_WINDOW_HOURS = 24


def _calculate_uptime_percent(observed_slots: int, first_slot: datetime.datetime | None) -> float:
    """Share of one-minute slots in which the backend reported a heartbeat."""
    if first_slot is None:
        return 100.0

    now_utc = utc_now_naive()
    window_start = now_utc - datetime.timedelta(hours=UPTIME_WINDOW_HOURS)
    effective_start = max(window_start, first_slot)
    total_minutes = max(1, int((now_utc - effective_start).total_seconds() // 60) + 1)

    return max(0.0, min(100.0, (observed_slots / total_minutes) * 100.0))


def _load_public_stats_from_db() -> dict[str, float | int | bool]:
    window_start = utc_now_naive() - datetime.timedelta(hours=UPTIME_WINDOW_HOURS)

    with db.connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total_users FROM registered_users")
            total_users = int((cursor.fetchone() or {}).get("total_users") or 0)

            cursor.execute(
                """
                SELECT COUNT(*) AS observed_slots, MIN(slot_ts) AS first_slot
                FROM service_heartbeats
                WHERE service_name = %s AND slot_ts >= %s
                """,
                (HEARTBEAT_SERVICE_NAME, window_start),
            )
            uptime_row = cursor.fetchone() or {}

    uptime_percent = _calculate_uptime_percent(
        int(uptime_row.get("observed_slots") or 0),
        uptime_row.get("first_slot"),
    )

    return {
        "available": True,
        # This is every account ever created, not a concurrency figure. It used
        # to be reported as "active_users", which was simply untrue.
        "registered_users": total_users,
        "uptime_percent": round(uptime_percent, 1),
    }


@router.get("/stats")
async def get_public_stats():
    """Public counters for the landing page.

    When the database is down this reports ``available: false`` instead of the
    hard-coded 17362 users / 93.7% uptime it used to invent, and the frontend
    hides the block.
    """
    try:
        return await asyncio.to_thread(_load_public_stats_from_db)
    except (pymysql.MySQLError, TimeoutError, ValueError, TypeError):
        log.warning("Public stats unavailable", exc_info=True)
        return {"available": False, "registered_users": None, "uptime_percent": None}


@router.get("/health", include_in_schema=False)
async def healthcheck():
    try:
        absent = await asyncio.to_thread(db.missing_tables)
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Health check failed", exc_info=True)
        raise database_http_error(error) from None

    if absent:
        log.error("Health check found missing tables: %s", ", ".join(absent))
        raise HTTPException(
            status_code=503,
            detail=f"Missing database tables: {', '.join(absent)}",
        )

    return {"status": "ok", "pool": db.pool_stats()}


def database_http_error(error: BaseException) -> HTTPException:
    """Map a database failure to an honest HTTP response.

    A missing table is a deployment fault that will not fix itself, so it must
    not masquerade as the transient 503 used for connection problems.
    """
    if db.is_schema_error(error):
        log.error("Database schema is incomplete", exc_info=error)
        return HTTPException(
            status_code=500,
            detail="Server database schema is incomplete; check the backend logs",
        )
    return HTTPException(status_code=503, detail="Database unavailable")


def extract_user_id(current_user: dict) -> int:
    user_id = current_user.get("id") or current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User is not authenticated")
    return int(user_id)
