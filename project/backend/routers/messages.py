import asyncio
import datetime
import json
import os
import urllib.parse
import urllib.request

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from databases.db_manager import get_connection
from routers.auth import get_current_user
from routers.common import extract_user_id

router = APIRouter(prefix="/api/messages", tags=["messages"])
load_dotenv()


class MessageCreate(BaseModel):
    friend_id: int
    message_type: str = "text"
    content: str


class ReactionToggle(BaseModel):
    friend_id: int
    message_id: int
    emoji: str


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


def _to_utc_iso(value):
    if not isinstance(value, datetime.datetime):
        return str(value)
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_reaction_emoji(value: str) -> str:
    emoji = (value or "").strip()
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji is required")
    if len(emoji) > 16:
        raise HTTPException(status_code=400, detail="Emoji is too long")
    return emoji


def _fetch_reactions_for_messages(cursor, message_ids, viewer_user_id: int):
    if not message_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(message_ids))
    cursor.execute(
        f"""
        SELECT
            message_id,
            emoji COLLATE utf8mb4_bin AS emoji,
            COUNT(*) AS total,
            MAX(CASE WHEN user_id = %s THEN 1 ELSE 0 END) AS mine
        FROM direct_message_reactions
        WHERE message_id IN ({placeholders})
        GROUP BY message_id, emoji COLLATE utf8mb4_bin
        ORDER BY message_id ASC, emoji COLLATE utf8mb4_bin ASC
        """,
        (viewer_user_id, *message_ids),
    )
    rows = cursor.fetchall() or []
    grouped = {}
    for row in rows:
        message_id = int(row["message_id"])
        grouped.setdefault(message_id, []).append(
            {
                "emoji": row["emoji"],
                "count": int(row["total"] or 0),
                "mine": bool(row["mine"]),
            }
        )
    return grouped


@router.get("/gif/search")
async def search_gifs(q: str, limit: int = 25):
    query = (q or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Empty GIF search query")

    safe_limit = max(1, min(limit, 50))
    api_key = os.getenv("GIPHY_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GIF search is not configured")

    def request_gifs():
        params = urllib.parse.urlencode(
            {"api_key": api_key, "q": query, "limit": safe_limit, "rating": "g"}
        )
        url = f"https://api.giphy.com/v1/gifs/search?{params}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                return None
            raw = resp.read().decode("utf-8")
            return json.loads(raw)

    try:
        data = await asyncio.to_thread(request_gifs)
    except Exception:
        raise HTTPException(status_code=502, detail="GIF provider unavailable")

    if not data:
        raise HTTPException(status_code=502, detail="GIF provider returned an error")

    items = []
    for gif in data.get("data", []):
        images = gif.get("images") or {}
        preview_url = (images.get("fixed_height_small") or {}).get("url")
        original_url = (images.get("original") or {}).get("url")
        if preview_url and original_url:
            items.append({"preview_url": preview_url, "url": original_url})

    return {"data": items}


@router.get("/{friend_id}")
async def get_messages(friend_id: int, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

    def query():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                if not _is_friend_accepted(cursor, user_id, friend_id):
                    return "not_friends"

                cursor.execute(
                    """
                    SELECT
                        id,
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
                message_ids = [int(row["id"]) for row in rows]
                reactions_by_message = _fetch_reactions_for_messages(cursor, message_ids, user_id)
                result = []
                for row in rows:
                    created = row.get("created_at")
                    message_id = int(row["id"])
                    result.append(
                        {
                            "id": message_id,
                            "side": "user" if row["sender_id"] == user_id else "bot",
                            "type": row["msg_type"],
                            "content": row["content"],
                            "created_at": _to_utc_iso(created),
                            "created_at_ms": row.get("created_at_ms"),
                            "reactions": reactions_by_message.get(message_id, []),
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
    user_id = extract_user_id(current_user)
    friend_id = payload.friend_id
    msg_type = (payload.message_type or "text").strip().lower()
    content = (payload.content or "").strip()

    if msg_type not in {"text", "gif"}:
        raise HTTPException(status_code=400, detail="Invalid message type")
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")
    if len(content) > 3000:
        raise HTTPException(status_code=400, detail="Message is too long")
    if msg_type == "gif" and not (content.startswith("http://") or content.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid GIF URL")
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
                message_id = cursor.lastrowid
                if not message_id:
                    conn.rollback()
                    raise HTTPException(status_code=500, detail="Failed to persist message")
                conn.commit()

                cursor.execute(
                    """
                    SELECT
                        created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM direct_messages
                    WHERE id = %s
                    """,
                    (message_id,),
                )
                created_row = cursor.fetchone() or {}
                created = created_row.get("created_at")
                return {
                    "id": int(message_id),
                    "type": msg_type,
                    "content": content,
                    "created_at": _to_utc_iso(created),
                    "created_at_ms": created_row.get("created_at_ms"),
                    "side": "user",
                    "reactions": [],
                }
        finally:
            conn.close()

    result = await asyncio.to_thread(insert)
    if result == "not_friends":
        raise HTTPException(status_code=403, detail="You can chat only with accepted friends")
    return {"ok": True, "message": result}


@router.delete("/{friend_id}")
async def clear_chat(friend_id: int, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)

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


@router.post("/reactions/toggle")
async def toggle_reaction(payload: ReactionToggle, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)
    friend_id = int(payload.friend_id)
    message_id = int(payload.message_id)
    emoji = _validate_reaction_emoji(payload.emoji)

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="Invalid friend")

    def mutate():
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                if not _is_friend_accepted(cursor, user_id, friend_id):
                    return "not_friends"

                cursor.execute(
                    """
                    SELECT id
                    FROM direct_messages
                    WHERE id = %s
                      AND (
                        (sender_id = %s AND receiver_id = %s)
                        OR
                        (sender_id = %s AND receiver_id = %s)
                      )
                    LIMIT 1
                    """,
                    (message_id, user_id, friend_id, friend_id, user_id),
                )
                message_row = cursor.fetchone()
                if not message_row:
                    return "not_found"

                cursor.execute(
                    """
                    SELECT emoji
                    FROM direct_message_reactions
                    WHERE message_id = %s AND user_id = %s
                    LIMIT 1
                    """,
                    (message_id, user_id),
                )
                existing = cursor.fetchone()

                action = "set"
                if existing and existing.get("emoji") == emoji:
                    cursor.execute(
                        "DELETE FROM direct_message_reactions WHERE message_id = %s AND user_id = %s",
                        (message_id, user_id),
                    )
                    action = "removed"
                elif existing:
                    cursor.execute(
                        "UPDATE direct_message_reactions SET emoji = %s WHERE message_id = %s AND user_id = %s",
                        (emoji, message_id, user_id),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO direct_message_reactions (message_id, user_id, emoji)
                        VALUES (%s, %s, %s)
                        """,
                        (message_id, user_id, emoji),
                    )

                conn.commit()
                reactions_by_message = _fetch_reactions_for_messages(cursor, [message_id], user_id)
                return {
                    "ok": True,
                    "action": action,
                    "message_id": message_id,
                    "reactions": reactions_by_message.get(message_id, []),
                }
        finally:
            conn.close()

    result = await asyncio.to_thread(mutate)
    if result == "not_friends":
        raise HTTPException(status_code=403, detail="You can react only in accepted friends chat")
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Message not found")
    return result
