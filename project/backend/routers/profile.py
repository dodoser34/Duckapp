import re
from imghdr import what as detect_image_type
from pathlib import Path
from uuid import uuid4

import pymysql
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from databases import db_manager as db
from routers.auth import get_token_from_cookie, verify_token

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[2]
ASSETS_DIR = BASE_DIR / "frontend" / "html" / "assets"
USER_AVATARS_DIR = ASSETS_DIR / "user_avatars"
USER_AVATARS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_STATUS = {"online", "invisible", "dnd", "offline"}
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024
DETECTED_TO_EXT = {"png": ".png", "jpeg": ".jpg", "webp": ".webp", "gif": ".gif"}
AVATAR_NAME_RE = re.compile(
    r"^(avatar_[0-9]{1,2}\.png|user_avatars/[a-zA-Z0-9_-]{8,64}\.(png|jpg|jpeg|webp|gif))$"
)


class ProfileUpdate(BaseModel):
    status: str | None = None
    avatar: str | None = None


def _get_user_id_by_username(username: str) -> int:
    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return int(user["id"])
    finally:
        cursor.close()
        conn.close()


def _validate_avatar_name(avatar: str) -> str:
    value = (avatar or "").strip()
    if not AVATAR_NAME_RE.match(value):
        raise HTTPException(status_code=400, detail="Invalid avatar name")
    return value


def _upsert_profile(user_id: int, username: str, status: str | None, avatar: str | None) -> None:
    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute("SELECT id FROM user_profiles WHERE user_id = %s", (user_id,))
        exists = cursor.fetchone()

        if exists:
            if status is not None:
                cursor.execute(
                    "UPDATE user_profiles SET status = %s WHERE user_id = %s",
                    (status, user_id),
                )
            if avatar is not None:
                cursor.execute(
                    "UPDATE user_profiles SET avatar = %s WHERE user_id = %s",
                    (avatar, user_id),
                )
        else:
            cursor.execute(
                "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
                (user_id, username, status or "online", avatar or "avatar_1.png"),
            )

        conn.commit()
    finally:
        cursor.close()
        conn.close()


@router.patch("/users/profile")
def update_profile(data: ProfileUpdate, token: str = Depends(get_token_from_cookie)):
    payload = verify_token(token)
    username: str = payload.get("sub")
    user_id = _get_user_id_by_username(username)

    status = data.status.strip().lower() if data.status else None
    if status is not None and status not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")

    avatar = _validate_avatar_name(data.avatar) if data.avatar else None
    _upsert_profile(user_id, username, status, avatar)
    return {"message": "Profile updated", "status": status, "avatar": avatar}


@router.post("/users/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    token: str = Depends(get_token_from_cookie),
):
    payload = verify_token(token)
    username: str = payload.get("sub")
    user_id = _get_user_id_by_username(username)

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    original_name = file.filename or ""
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Unsupported image extension")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="Avatar is too large (max 2MB)")

    detected = detect_image_type(None, content)
    detected_ext = DETECTED_TO_EXT.get(detected)
    if not detected_ext:
        raise HTTPException(status_code=400, detail="Invalid image file")

    generated = f"{uuid4().hex}{detected_ext if detected_ext != '.jpg' or ext != '.jpeg' else '.jpeg'}"
    relative_path = f"user_avatars/{generated}"
    abs_path = USER_AVATARS_DIR / generated
    abs_path.write_bytes(content)

    _upsert_profile(user_id, username, None, relative_path)
    return {"ok": True, "avatar": relative_path}
