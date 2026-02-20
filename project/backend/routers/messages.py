from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from routers.auth import get_current_user
from DataBases.db_manager import get_connection
import asyncio
import datetime

router = APIRouter(prefix="/api/messages", tags=["messages"])


class MessageCreate(BaseModel):
    friend_id: int
    message_type: str = "text"
    content: str


def _is_friend_accepted(cursor, user_id: int, friend_id: int) -> bool:
    cursor.execute(
        """
        SELECT 1
        FROM friends
        WHERE status = 'accepted'
        AND (
            (user_id = %s AND friend_id = %s)
            OR
            (user_id = %s AND friend_id = %s)
        )
        LIMIT 1
        """,
        (user_id, friend_id, friend_id, user_id),
    )
    return cursor.fetchone() is not None


@router.get("/{friend_id}")
async def get_messages(friend_id: int, current_user=Depends(get_current_user)):
    user_id = current_user.get("id") or current_user.get("user_id")

    def query():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                if not _is_friend_accepted(cursor, user_id, friend_id):
                    return "not_friends"

                cursor.execute(
                    """
                    SELECT
                        sender_id,
                        receiver_id,
                        msg_type,
                        content,
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM direct_messages
                    WHERE (sender_id = %s AND receiver_id = %s)
                        OR (sender_id = %s AND receiver_id = %s)
                    ORDER BY created_at ASC, id ASC
                    """,
                    (user_id, friend_id, friend_id, user_id),
                )
                rows = cursor.fetchall() or []
                result = []
                for row in rows:
                    created = row.get("created_at")
                    if isinstance(created, datetime.datetime):
                        created_iso = created.isoformat()
                    else:
                        created_iso = str(created)
                    result.append(
                        {
                            "side": "user" if row["sender_id"] == user_id else "bot",
                            "type": row["msg_type"],
                            "content": row["content"],
                            "created_at": created_iso,
                            "created_at_ms": row.get("created_at_ms"),
                        }
                    )
                return result
        finally:
            conn.close()

    data = await asyncio.to_thread(query)
    if data == "not_friends":
        raise HTTPException(status_code=403, detail="You can chat only with accepted friends")
    return data


@router.post("")
async def send_message(payload: MessageCreate, current_user=Depends(get_current_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    friend_id = payload.friend_id
    msg_type = (payload.message_type or "text").strip().lower()
    content = (payload.content or "").strip()

    if msg_type not in {"text", "gif"}:
        raise HTTPException(status_code=400, detail="Invalid message type")
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")
    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot message yourself")

    def insert():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                if not _is_friend_accepted(cursor, user_id, friend_id):
                    return "not_friends"

                cursor.execute(
                    """
                    INSERT INTO direct_messages (sender_id, receiver_id, msg_type, content)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, friend_id, msg_type, content),
                )
                conn.commit()

                cursor.execute(
                    """
                    SELECT
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM direct_messages
                    WHERE id = %s
                    """,
                    (cursor.lastrowid,),
                )
                created_row = cursor.fetchone() or {}
                created = created_row.get("created_at")
                if isinstance(created, datetime.datetime):
                    created_iso = created.isoformat()
                else:
                    created_iso = str(created)
                return {
                    "type": msg_type,
                    "content": content,
                    "created_at": created_iso,
                    "created_at_ms": created_row.get("created_at_ms"),
                    "side": "user",
                }
        finally:
            conn.close()

    result = await asyncio.to_thread(insert)
    if result == "not_friends":
        raise HTTPException(status_code=403, detail="You can chat only with accepted friends")
    return {"ok": True, "message": result}


@router.delete("/{friend_id}")
async def clear_chat(friend_id: int, current_user=Depends(get_current_user)):
    user_id = current_user.get("id") or current_user.get("user_id")

    def clear():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM direct_messages
                    WHERE (sender_id = %s AND receiver_id = %s)
                        OR (sender_id = %s AND receiver_id = %s)
                    """,
                    (user_id, friend_id, friend_id, user_id),
                )
                affected = cursor.rowcount
                conn.commit()
                return affected
        finally:
            conn.close()

    deleted = await asyncio.to_thread(clear)
    return {"ok": True, "deleted": deleted}
