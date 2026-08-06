import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.logging_config import get_logger
from core.timeutils import to_utc_iso, utc_now_naive
from databases import db_manager as db
from routers.auth import get_current_user
from routers.common import extract_user_id

router = APIRouter(prefix="/api/messages", tags=["messages"])
load_dotenv()
log = get_logger("messages")

MESSAGE_MAX_LENGTH = 3000
GIF_URL_MAX_LENGTH = 2048
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

# Mirrors REACTION_EMOJIS in frontend/js/chat/chat-logic.js. Without a
# whitelist the column happily stored 16 characters of arbitrary text.
ALLOWED_REACTIONS = {
    "\U0001F44D",              # thumbs up
    "❤️",            # red heart
    "\U0001F602",              # tears of joy
    "\U0001F62E",              # open mouth
    "\U0001F622",              # crying
    "\U0001F44E",              # thumbs down
}


class MessageCreate(BaseModel):
    friend_id: int = Field(gt=0)
    message_type: str = "text"
    content: str


class ReactionToggle(BaseModel):
    friend_id: int = Field(gt=0)
    message_id: int = Field(gt=0)
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


def _require_friendship(cursor, user_id: int, friend_id: int) -> None:
    if not _is_friend_accepted(cursor, user_id, friend_id):
        raise PermissionError("not_friends")


def _validate_reaction_emoji(value: str) -> str:
    emoji = (value or "").strip()
    if emoji not in ALLOWED_REACTIONS:
        raise HTTPException(status_code=400, detail="Unsupported reaction")
    return emoji


def _validate_gif_url(url: str) -> str:
    value = (url or "").strip()
    if len(value) > GIF_URL_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid GIF URL")

    parsed = urllib.parse.urlparse(value)
    # https only: an http image would be blocked as mixed content anyway, and
    # embedded credentials (user:pass@host) have no business in a chat message.
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Invalid GIF URL")
    return value


def _fetch_reactions_for_messages(cursor, message_ids, viewer_user_id: int) -> dict:
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
    grouped: dict[int, list[dict]] = {}
    for row in cursor.fetchall() or []:
        grouped.setdefault(int(row["message_id"]), []).append(
            {
                "emoji": row["emoji"],
                "count": int(row["total"] or 0),
                "mine": bool(row["mine"]),
            }
        )
    return grouped


def _cleared_at(cursor, user_id: int, peer_id: int):
    cursor.execute(
        "SELECT cleared_at FROM direct_message_clears WHERE user_id = %s AND peer_id = %s",
        (user_id, peer_id),
    )
    row = cursor.fetchone()
    return row["cleared_at"] if row else None


def _serialize_message(row: dict, user_id: int, reactions: dict) -> dict:
    message_id = int(row["id"])
    return {
        "id": message_id,
        "side": "user" if row["sender_id"] == user_id else "peer",
        "type": row["msg_type"],
        "content": row["content"],
        "created_at": to_utc_iso(row.get("created_at")),
        "created_at_ms": row.get("created_at_ms"),
        "reactions": reactions.get(message_id, []),
    }


@router.get("/gif/search")
async def search_gifs(q: str, limit: int = 25):
    query = (q or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Empty GIF search query")
    if len(query) > 100:
        raise HTTPException(status_code=400, detail="GIF search query is too long")

    safe_limit = max(1, min(limit, 50))
    api_key = os.getenv("GIPHY_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GIF search is not configured")

    def request_gifs():
        params = urllib.parse.urlencode(
            {"api_key": api_key, "q": query, "limit": safe_limit, "rating": "g"}
        )
        url = f"https://api.giphy.com/v1/gifs/search?{params}"
        with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))

    try:
        data = await asyncio.to_thread(request_gifs)
    except (urllib.error.URLError, OSError, ValueError) as error:
        log.warning("Giphy request failed: %s", error)
        raise HTTPException(status_code=502, detail="GIF provider unavailable") from None

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
async def get_messages(
    friend_id: int,
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    before_id: int | None = Query(None, ge=1),
    current_user=Depends(get_current_user),
):
    """Return one page of a conversation, newest page first.

    This endpoint used to select the entire history on every poll (once every
    two seconds per client). It is now bounded by ``limit``; ``before_id``
    walks backwards for older pages.
    """
    user_id = extract_user_id(current_user)

    def query():
        with db.connection() as conn:
            with conn.cursor() as cursor:
                _require_friendship(cursor, user_id, friend_id)

                # A cleared chat only hides messages for the viewer who
                # cleared it; the other participant keeps their copy.
                cleared_at = _cleared_at(cursor, user_id, friend_id)

                conditions = [
                    "((sender_id = %s AND receiver_id = %s) OR (sender_id = %s AND receiver_id = %s))"
                ]
                params: list = [user_id, friend_id, friend_id, user_id]

                if cleared_at is not None:
                    conditions.append("created_at > %s")
                    params.append(cleared_at)
                if before_id is not None:
                    conditions.append("id < %s")
                    params.append(before_id)

                where = " AND ".join(conditions)
                # Newest first with LIMIT so MySQL can stop early, then flip.
                cursor.execute(
                    f"""
                    SELECT
                        id, sender_id, receiver_id, msg_type, content, created_at,
                        CAST(UNIX_TIMESTAMP(created_at) * 1000 AS UNSIGNED) AS created_at_ms
                    FROM direct_messages
                    WHERE {where}
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (*params, limit + 1),
                )
                rows = cursor.fetchall() or []

                has_more = len(rows) > limit
                rows = rows[:limit]
                rows.reverse()

                message_ids = [int(row["id"]) for row in rows]
                reactions = _fetch_reactions_for_messages(cursor, message_ids, user_id)

                return {
                    "items": [_serialize_message(row, user_id, reactions) for row in rows],
                    "has_more": has_more,
                    "oldest_id": message_ids[0] if message_ids else None,
                }

    try:
        return await asyncio.to_thread(query)
    except PermissionError:
        raise HTTPException(status_code=403, detail="You can chat only with accepted friends") from None


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
    if len(content) > MESSAGE_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Message is too long")
    if msg_type == "gif":
        content = _validate_gif_url(content)
    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="You cannot message yourself")

    def insert():
        with db.transaction() as (conn, cursor):
            _require_friendship(cursor, user_id, friend_id)

            cursor.execute(
                """
                INSERT INTO direct_messages (sender_id, receiver_id, msg_type, content)
                VALUES (%s, %s, %s, %s)
                """,
                (user_id, friend_id, msg_type, content),
            )
            message_id = cursor.lastrowid
            if not message_id:
                raise RuntimeError("insert produced no id")

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
            return {
                "id": int(message_id),
                "type": msg_type,
                "content": content,
                "created_at": to_utc_iso(created_row.get("created_at")),
                "created_at_ms": created_row.get("created_at_ms"),
                "side": "user",
                "reactions": [],
            }

    try:
        result = await asyncio.to_thread(insert)
    except PermissionError:
        raise HTTPException(status_code=403, detail="You can chat only with accepted friends") from None
    except RuntimeError:
        log.error("Message insert returned no id", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to persist message") from None

    return {"ok": True, "message": result}


@router.delete("/{friend_id}")
async def clear_chat(friend_id: int, current_user=Depends(get_current_user)):
    """Hide the conversation for the caller only.

    The old implementation ran a DELETE across both directions, so "clear my
    chat" destroyed the other person's copy too — irreversibly, and without
    even checking that the two were friends.
    """
    user_id = extract_user_id(current_user)

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="Invalid friend")

    def clear():
        with db.transaction() as (conn, cursor):
            _require_friendship(cursor, user_id, friend_id)
            cursor.execute(
                """
                INSERT INTO direct_message_clears (user_id, peer_id, cleared_at)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE cleared_at = VALUES(cleared_at)
                """,
                (user_id, friend_id, utc_now_naive()),
            )

    try:
        await asyncio.to_thread(clear)
    except PermissionError:
        raise HTTPException(status_code=403, detail="You can chat only with accepted friends") from None

    log.info("User %s cleared their view of the chat with %s", user_id, friend_id)
    return {"ok": True, "cleared_for": "self"}


@router.post("/reactions/toggle")
async def toggle_reaction(payload: ReactionToggle, current_user=Depends(get_current_user)):
    user_id = extract_user_id(current_user)
    friend_id = payload.friend_id
    message_id = payload.message_id
    emoji = _validate_reaction_emoji(payload.emoji)

    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="Invalid friend")

    def mutate():
        with db.transaction() as (conn, cursor):
            _require_friendship(cursor, user_id, friend_id)

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
            if not cursor.fetchone():
                raise LookupError("message not found")

            cursor.execute(
                "SELECT emoji FROM direct_message_reactions "
                "WHERE message_id = %s AND user_id = %s LIMIT 1",
                (message_id, user_id),
            )
            existing = cursor.fetchone()

            if existing and existing.get("emoji") == emoji:
                cursor.execute(
                    "DELETE FROM direct_message_reactions WHERE message_id = %s AND user_id = %s",
                    (message_id, user_id),
                )
                action = "removed"
            elif existing:
                cursor.execute(
                    "UPDATE direct_message_reactions SET emoji = %s "
                    "WHERE message_id = %s AND user_id = %s",
                    (emoji, message_id, user_id),
                )
                action = "set"
            else:
                cursor.execute(
                    """
                    INSERT INTO direct_message_reactions (message_id, user_id, emoji)
                    VALUES (%s, %s, %s)
                    """,
                    (message_id, user_id, emoji),
                )
                action = "set"

            reactions = _fetch_reactions_for_messages(cursor, [message_id], user_id)
            return {
                "ok": True,
                "action": action,
                "message_id": message_id,
                "reactions": reactions.get(message_id, []),
            }

    try:
        return await asyncio.to_thread(mutate)
    except PermissionError:
        raise HTTPException(status_code=403, detail="You can react only in accepted friends chat") from None
    except LookupError:
        raise HTTPException(status_code=404, detail="Message not found") from None
