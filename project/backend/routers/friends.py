import asyncio

import pymysql
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from databases.db_manager import get_connection
from routers.auth import get_current_user
from routers.common import extract_user_id

router = APIRouter(prefix="/api/friends", tags=["friends"])


class FriendAddRequest(BaseModel):
    friend_id: int


class FriendRequestRespond(BaseModel):
    request_id: int
    action: str


@router.get("/search")
async def search_friend(names: str, current_user=Depends(get_current_user)):
    current_user_id = extract_user_id(current_user)

    def query():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id AS id, names, avatar, status
                    FROM user_profiles
                    WHERE names = %s
                    """,
                    (names,),
                )
                return cursor.fetchone()
        finally:
            conn.close()

    result = await asyncio.to_thread(query)

    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    if result["id"] == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    return {
        "id": result["id"],
        "names": result["names"],
        "avatar": result["avatar"],
        "status": result["status"],
    }


@router.post("/add")
async def add_friend(req: FriendAddRequest, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)
    friend_id = req.friend_id

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    def insert_request():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM registered_users WHERE id=%s", (friend_id,))
                if cursor.fetchone() is None:
                    return "missing_user"

                cursor.execute(
                    """
                    SELECT id, user_id, friend_id, status
                    FROM friends
                    WHERE (user_id=%s AND friend_id=%s)
                        OR (user_id=%s AND friend_id=%s)
                    """,
                    (user_id, friend_id, friend_id, user_id),
                )
                relations = cursor.fetchall() or []

                for rel in relations:
                    if rel["status"] == "accepted":
                        return "already_friends"
                    if rel["user_id"] == user_id and rel["friend_id"] == friend_id and rel["status"] == "pending":
                        return "already_sent"
                    if rel["user_id"] == friend_id and rel["friend_id"] == user_id and rel["status"] == "pending":
                        return "incoming_exists"

                try:
                    cursor.execute(
                        "INSERT INTO friends (user_id, friend_id, status) VALUES (%s, %s, 'pending')",
                        (user_id, friend_id),
                    )
                    conn.commit()
                    return "created"
                except pymysql.err.IntegrityError:
                    conn.rollback()
                    return "already_sent"
        finally:
            conn.close()

    result = await asyncio.to_thread(insert_request)

    if result == "missing_user":
        raise HTTPException(status_code=404, detail="User not found")
    if result == "already_friends":
        raise HTTPException(status_code=400, detail="Already in friends")
    if result == "already_sent":
        raise HTTPException(status_code=400, detail="Friend request already sent")
    if result == "incoming_exists":
        raise HTTPException(status_code=400, detail="You already have an incoming request from this user")

    return {"ok": True, "message": "Friend request sent"}


@router.get("/requests/incoming")
async def get_incoming_requests(current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

    def load_requests():
        conn = get_connection()
        try:
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
                    WHERE f.friend_id = %s
                        AND f.status = 'pending'
                    ORDER BY f.id DESC
                    """,
                    (user_id,),
                )
                return cursor.fetchall() or []
        finally:
            conn.close()

    return await asyncio.to_thread(load_requests)


@router.post("/requests/respond")
async def respond_to_request(req: FriendRequestRespond, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)
    action = (req.action or "").strip().lower()

    if action not in {"accept", "reject"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    def handle_request():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, user_id, friend_id, status
                    FROM friends
                    WHERE id = %s AND friend_id = %s
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
                    conn.commit()
                    return "rejected"

                cursor.execute("UPDATE friends SET status = 'accepted' WHERE id = %s", (req.request_id,))
                cursor.execute(
                    "SELECT id, status FROM friends WHERE user_id = %s AND friend_id = %s",
                    (user_id, requester_id),
                )
                reverse = cursor.fetchone()
                if reverse:
                    if reverse["status"] != "accepted":
                        cursor.execute("UPDATE friends SET status = 'accepted' WHERE id = %s", (reverse["id"],))
                else:
                    cursor.execute(
                        "INSERT INTO friends (user_id, friend_id, status) VALUES (%s, %s, 'accepted')",
                        (user_id, requester_id),
                    )

                conn.commit()
                return "accepted"
        finally:
            conn.close()

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
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM friends
                    WHERE (user_id = %s AND friend_id = %s)
                        OR (user_id = %s AND friend_id = %s)
                    """,
                    (user_id, friend_id, friend_id, user_id),
                )
                affected = cursor.rowcount
                conn.commit()
                return affected
        finally:
            conn.close()

    affected = await asyncio.to_thread(delete_relation)

    if affected == 0:
        raise HTTPException(status_code=404, detail="Friend relation not found")

    return {"ok": True, "removed": True}


@router.get("/list")
async def get_friends(current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

    conn = get_connection()
    try:
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
                    ON ru.id = CASE
                        WHEN f.user_id = %s THEN f.friend_id
                        ELSE f.user_id
                    END
                LEFT JOIN user_profiles up ON up.user_id = ru.id
                WHERE (f.user_id = %s OR f.friend_id = %s)
                    AND f.status = 'accepted'
                ORDER BY names
                """,
                (user_id, user_id, user_id),
            )
            return cursor.fetchall()
    finally:
        conn.close()
