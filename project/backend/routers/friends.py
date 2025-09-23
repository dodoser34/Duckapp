from fastapi import APIRouter, Depends, HTTPException, Query
from routers.auth import get_current_user
import asyncio
from DataBases.db_manager import get_connection
from pydantic import BaseModel

router = APIRouter(prefix="/api/friends", tags=["friends"])

class FriendAddRequest(BaseModel):
    friend_id: int


# Search user by nickname
@router.get("/search")
async def search_friend(names: str, current_user=Depends(get_current_user)):
    def query():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, names, avatar, status FROM user_profiles WHERE names=%s",
                    (names,)
                )
                return cursor.fetchone()
        finally:
            conn.close()

    result = await asyncio.to_thread(query)

    if not result:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": result["id"],
        "names": result["names"],
        "avatar": result["avatar"],
        "status": result["status"]
    }

@router.post("/add")
async def add_friend(req: FriendAddRequest, current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    friend_id = req.friend_id

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    def insert_friend():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                # Check if record already exists
                cursor.execute(
                    "SELECT 1 FROM friends WHERE user_id=%s AND friend_id=%s",
                    (user_id, friend_id)
                )
                if cursor.fetchone():
                    return "exists"

                cursor.execute(
                    "INSERT INTO friends (user_id, friend_id) VALUES (%s, %s)",
                    (user_id, friend_id)
                )
                conn.commit()
                return "ok"
        finally:
            conn.close()

    result = await asyncio.to_thread(insert_friend)

    if result == "exists":
        raise HTTPException(status_code=400, detail="Already in friends")

    return {"ok": True, "message": "Friend added"}

#! Get friends list from DB --------------------
@router.get("/list")
async def get_friends(current_user=Depends(get_current_user)):
    user_id = current_user.get("id") or current_user.get("user_id")

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT u.id, u.names, u.avatar, u.status
                FROM friends f
                JOIN user_profiles u ON f.friend_id = u.id
                WHERE f.user_id = %s
            """, (user_id,))
            return cursor.fetchall()
    finally:
        conn.close()