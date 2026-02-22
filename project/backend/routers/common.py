import os

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["common"])

DEFAULT_ACTIVE_USERS = 17362
DEFAULT_UPTIME_PERCENT = 93.7


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


@router.get("/stats")
async def get_public_stats():
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
