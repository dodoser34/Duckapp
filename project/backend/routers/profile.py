from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from DataBases import db_manager as db
from routers.auth import get_token_from_cookie, verify_token
import pymysql

router = APIRouter()

class ProfileUpdate(BaseModel):
    status: str | None = None
    avatar: str | None = None


@router.patch("/users/profile")
def update_profile(
    data: ProfileUpdate,
    token: str = Depends(get_token_from_cookie)
):
    payload = verify_token(token)
    username: str = payload.get("sub")

    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)

    cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    user_id = user["id"]

    # если нет строки в user_profiles — создаём
    cursor.execute("SELECT user_id FROM user_profiles WHERE user_id = %s", (user_id,))
    exists = cursor.fetchone()

    if exists:
        if data.status:
            cursor.execute("UPDATE user_profiles SET status = %s WHERE user_id = %s", (data.status, user_id))
        if data.avatar:
            cursor.execute("UPDATE user_profiles SET avatar = %s WHERE user_id = %s", (data.avatar, user_id))
    else:
        cursor.execute("INSERT INTO user_profiles (user_id, status, avatar) VALUES (%s, %s, %s)",
                       (user_id, data.status or "online", data.avatar or "avatar_1.png"))

    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "Profile updated", "status": data.status, "avatar": data.avatar}

@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}
