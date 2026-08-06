import asyncio

import pymysql
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.config import env_positive_int, public_avatar, public_status
from core.logging_config import get_logger
from core.ratelimit import RateLimiter
from core.web import client_ip
from databases import db_manager as db
from routers.auth import get_current_user
from routers.common import extract_user_id

router = APIRouter(prefix="/api/friends", tags=["friends"])
log = get_logger("friends")

SEARCH_MIN_LENGTH = 3
SEARCH_MAX_LENGTH = 50

# Search answers "does this exact nickname exist?", so an unthrottled endpoint
# is a username oracle. Budget is per account, not per IP alone.
_search_limiter = RateLimiter(
    window_seconds=env_positive_int("DUCKAPP_FRIEND_SEARCH_WINDOW_SECONDS", 60),
    max_events=env_positive_int("DUCKAPP_FRIEND_SEARCH_MAX", 20),
)


class FriendAddRequest(BaseModel):
    friend_id: int = Field(gt=0)


class FriendRequestRespond(BaseModel):
    request_id: int = Field(gt=0)
    action: str


def _public_peer(row: dict) -> dict:
    row["status"] = public_status(row.get("status"))
    row["avatar"] = public_avatar(row.get("avatar"))
    return row


@router.get("/search")
async def search_friend(names: str, request: Request, current_user=Depends(get_current_user)):
    current_user_id = extract_user_id(current_user)
    query = (names or "").strip()

    if len(query) < SEARCH_MIN_LENGTH or len(query) > SEARCH_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid search query")

    if not _search_limiter.check([f"search:{current_user_id}", f"search-ip:{client_ip(request)}"]):
        raise HTTPException(status_code=429, detail="Too many search requests")

    def run():
        with db.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id AS id, names, avatar, status
                    FROM user_profiles
                    WHERE names = %s
                    ORDER BY user_id ASC
                    LIMIT 1
                    """,
                    (query,),
                )
                return cursor.fetchone()

    result = await asyncio.to_thread(run)

    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    if result["id"] == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    return _public_peer(
        {
            "id": result["id"],
            "names": result["names"],
            "avatar": result.get("avatar"),
            "status": result.get("status"),
        }
    )


@router.post("/add")
async def add_friend(req: FriendAddRequest, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)
    friend_id = req.friend_id

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    def insert_request():
        with db.transaction() as (conn, cursor):
            cursor.execute("SELECT 1 FROM registered_users WHERE id = %s", (friend_id,))
            if cursor.fetchone() is None:
                return "missing_user"

            cursor.execute(
                """
                SELECT id, user_id, friend_id, status
                FROM friends
                WHERE (user_id = %s AND friend_id = %s)
                    OR (user_id = %s AND friend_id = %s)
                """,
                (user_id, friend_id, friend_id, user_id),
            )
            for rel in cursor.fetchall() or []:
                if rel["status"] == "accepted":
                    return "already_friends"
                if rel["user_id"] == user_id and rel["status"] == "pending":
                    return "already_sent"
                if rel["user_id"] == friend_id and rel["status"] == "pending":
                    return "incoming_exists"

            try:
                cursor.execute(
                    "INSERT INTO friends (user_id, friend_id, status) VALUES (%s, %s, 'pending')",
                    (user_id, friend_id),
                )
            except pymysql.err.IntegrityError:
                # Lost a race against a concurrent identical request.
                return "already_sent"
            return "created"

    result = await asyncio.to_thread(insert_request)

    errors = {
        "missing_user": (404, "User not found"),
        "already_friends": (400, "Already in friends"),
        "already_sent": (400, "Friend request already sent"),
        "incoming_exists": (400, "You already have an incoming request from this user"),
    }
    if result in errors:
        status_code, detail = errors[result]
        raise HTTPException(status_code=status_code, detail=detail)

    return {"ok": True, "message": "Friend request sent"}


@router.get("/requests/incoming")
async def get_incoming_requests(current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

    def load_requests():
        with db.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        f.id AS request_id,
                        ru.id AS id,
                        COALESCE(up.names, ru.username) AS names,
                        up.avatar AS avatar,
                        up.status AS status
                    FROM friends f
                    JOIN registered_users ru ON ru.id = f.user_id
                    LEFT JOIN user_profiles up ON up.user_id = ru.id
                    WHERE f.friend_id = %s AND f.status = 'pending'
                    ORDER BY f.id DESC
                    LIMIT 200
                    """,
                    (user_id,),
                )
                return cursor.fetchall() or []

    rows = await asyncio.to_thread(load_requests)
    return [_public_peer(row) for row in rows]


@router.post("/requests/respond")
async def respond_to_request(req: FriendRequestRespond, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)
    action = (req.action or "").strip().lower()

    if action not in {"accept", "reject"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    def handle_request():
        with db.transaction() as (conn, cursor):
            cursor.execute(
                """
                SELECT id, user_id, friend_id, status
                FROM friends
                WHERE id = %s AND friend_id = %s
                FOR UPDATE
                """,
                (req.request_id, user_id),
            )
            request_row = cursor.fetchone()
            if not request_row:
                return "not_found"
            if request_row["status"] != "pending":
                return "already_processed"

            requester_id = request_row["user_id"]

            if action == "reject":
                cursor.execute("DELETE FROM friends WHERE id = %s", (req.request_id,))
                return "rejected"

            cursor.execute(
                "UPDATE friends SET status = 'accepted' WHERE id = %s", (req.request_id,)
            )
            # Mirror row so both directions read as accepted. INSERT..ON
            # DUPLICATE avoids the 500 the previous select-then-insert hit
            # when two accepts raced.
            cursor.execute(
                """
                INSERT INTO friends (user_id, friend_id, status)
                VALUES (%s, %s, 'accepted')
                ON DUPLICATE KEY UPDATE status = 'accepted'
                """,
                (user_id, requester_id),
            )
            return "accepted"

    result = await asyncio.to_thread(handle_request)

    if result == "not_found":
        raise HTTPException(status_code=404, detail="Request not found")
    if result == "already_processed":
        raise HTTPException(status_code=400, detail="Request already processed")

    return {"ok": True, "status": result}


@router.delete("/remove/{friend_id}")
async def remove_friend(friend_id: int, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    def delete_relation():
        with db.transaction() as (conn, cursor):
            cursor.execute(
                """
                DELETE FROM friends
                WHERE (user_id = %s AND friend_id = %s)
                    OR (user_id = %s AND friend_id = %s)
                """,
                (user_id, friend_id, friend_id, user_id),
            )
            return cursor.rowcount

    affected = await asyncio.to_thread(delete_relation)

    if affected == 0:
        raise HTTPException(status_code=404, detail="Friend relation not found")

    return {"ok": True, "removed": True}


@router.get("/list")
async def get_friends(current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

    # This was the one handler in the file that ran its query directly on the
    # event loop, stalling every other request while MySQL answered.
    def load():
        with db.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT DISTINCT
                        ru.id AS id,
                        COALESCE(up.names, ru.username) AS names,
                        up.avatar AS avatar,
                        up.status AS status
                    FROM friends f
                    JOIN registered_users ru
                        ON ru.id = CASE WHEN f.user_id = %s THEN f.friend_id ELSE f.user_id END
                    LEFT JOIN user_profiles up ON up.user_id = ru.id
                    WHERE (f.user_id = %s OR f.friend_id = %s)
                        AND f.status = 'accepted'
                    ORDER BY names
                    LIMIT 500
                    """,
                    (user_id, user_id, user_id),
                )
                return cursor.fetchall() or []

    rows = await asyncio.to_thread(load)
    return [_public_peer(row) for row in rows]
