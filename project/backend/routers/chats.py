from fastapi import APIRouter, Depends, HTTPException, Form
from DataBases import db_manager as db
from routers.auth import get_current_user

router = APIRouter()

# ---------------- CHATS LIST ----------------
@router.get("/chats")
async def get_chats(user=Depends(get_current_user)):
    conn = db.get_connection()
    cursor = conn.cursor()

    # Groups
    cursor.execute("""
    SELECT g.id, g.name, g.avatar FROM groups g
    JOIN group_members gm ON gm.group_id=g.id
    WHERE gm.user_id=%s
    """, (user["id"],))
    groups = cursor.fetchall()

    # Friends
    cursor.execute("""
    SELECT u.id, u.username as name FROM registered_users u
    JOIN friends f ON (f.friend_id=u.id OR f.user_id=u.id)
    WHERE (f.user_id=%s OR f.friend_id=%s) AND f.status='accepted' AND u.id!=%s
    """, (user["id"], user["id"], user["id"]))
    friends = cursor.fetchall()

    cursor.close()
    conn.close()
    return {"ok": True, "result": {"groups": groups, "friends": friends}}

# ---------------- SEARCH USERS ----------------
@router.get("/users/search")
async def search_users(q: str, user=Depends(get_current_user)):
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username as name FROM registered_users WHERE username LIKE %s LIMIT 20", (f"%{q}%",))
    users = cursor.fetchall()
    cursor.close()
    conn.close()
    return {"ok": True, "result": users}

# ---------------- ADD FRIEND ----------------
@router.post("/users/add_friend")
async def add_friend(friend_id: int = Form(...), user=Depends(get_current_user)):
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("INSERT INTO friends (user_id, friend_id, status) VALUES (%s,%s,'accepted')",
                (user["id"], friend_id))
    cursor.execute("INSERT INTO friends (user_id, friend_id, status) VALUES (%s,%s,'accepted')",
                (friend_id, user["id"]))

    conn.commit()
    cursor.close()
    conn.close()
    return {"ok": True, "result": {"id": friend_id}}

# ---------------- MESSAGES ----------------
@router.get("/chats/{chat_type}/{chat_id}/messages")
async def get_messages(chat_type: str, chat_id: int, user=Depends(get_current_user)):
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT sender_id, text, created_at FROM messages WHERE chat_type=%s AND chat_id=%s ORDER BY id ASC",
                (chat_type, chat_id))
    msgs = cursor.fetchall()
    for m in msgs:
        m["fromMe"] = (m["sender_id"] == user["id"])
    cursor.close()
    conn.close()
    return {"ok": True, "result": msgs}

@router.post("/chats/{chat_type}/{chat_id}/send")
async def send_message(chat_type: str, chat_id: int, text: str = Form(...), user=Depends(get_current_user)):
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO messages (chat_type, chat_id, sender_id, text) VALUES (%s,%s,%s,%s)",
                (chat_type, chat_id, user["id"], text))
    conn.commit()
    cursor.close()
    conn.close()
    return {"ok": True}