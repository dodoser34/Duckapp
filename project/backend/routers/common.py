import asyncio
import datetime
import os

import pymysql

from fastapi import APIRouter, HTTPException

from databases import db_manager as db

router = APIRouter(prefix="/api", tags=["common"])

DEFAULT_ACTIVE_USERS = 17362
DEFAULT_UPTIME_PERCENT = 93.7
HEARTBEAT_SERVICE_NAME = "backend"
UPTIME_WINDOW_HOURS = 24


def _parse_positive_int(value: str | None, default: int) -> int:
    try:
        parsed = int(str(value).strip())
        return max(0, parsed)
    except (TypeError, ValueError):
        return default


def _parse_percent(value: str | None, default: float) -> float:
    try:
        parsed = float(str(value).strip())
        return max(0.0, min(100.0, parsed))
    except (TypeError, ValueError):
        return default


def _calculate_uptime_percent(observed_slots: int, first_slot: datetime.datetime | None) -> float:
    now_utc = datetime.datetime.utcnow()
    window_start = now_utc - datetime.timedelta(hours=UPTIME_WINDOW_HOURS)

    if first_slot is None:
        return 100.0

    effective_start = max(window_start, first_slot)
    total_minutes = int((now_utc - effective_start).total_seconds() // 60) + 1
    total_minutes = max(1, total_minutes)

    return max(0.0, min(100.0, (observed_slots / total_minutes) * 100.0))


def _load_public_stats_from_db() -> dict[str, float | int]:
    window_start = datetime.datetime.utcnow() - datetime.timedelta(hours=UPTIME_WINDOW_HOURS)
    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute("SELECT COUNT(*) AS total_users FROM registered_users")
        total_row = cursor.fetchone() or {}
        total_users = int(total_row.get("total_users") or 0)

        cursor.execute(
            """
            SELECT
                COUNT(*) AS observed_slots,
                MIN(slot_ts) AS first_slot
            FROM service_heartbeats
            WHERE service_name = %s
                AND slot_ts >= %s
            """,
            (HEARTBEAT_SERVICE_NAME, window_start),
        )
        uptime_row = cursor.fetchone() or {}
        observed_slots = int(uptime_row.get("observed_slots") or 0)
        first_slot = uptime_row.get("first_slot")
        uptime_percent = _calculate_uptime_percent(observed_slots, first_slot)

        return {
            "active_users": total_users,
            "uptime_percent": round(uptime_percent, 1),
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/stats")
async def get_public_stats():
    try:
        return await asyncio.to_thread(_load_public_stats_from_db)
    except (pymysql.MySQLError, ValueError, TypeError):
        active_users = _parse_positive_int(
            os.getenv("DUCKAPP_PUBLIC_ACTIVE_USERS"),
            DEFAULT_ACTIVE_USERS,
        )
        uptime_percent = _parse_percent(
            os.getenv("DUCKAPP_PUBLIC_UPTIME_PERCENT"),
            DEFAULT_UPTIME_PERCENT,
        )
        return {
            "active_users": active_users,
            "uptime_percent": round(uptime_percent, 1),
        }


def extract_user_id(current_user: dict) -> int:
    user_id = current_user.get("id") or current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User is not authenticated")
    return int(user_id)
