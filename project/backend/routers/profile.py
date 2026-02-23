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
ALLOWED_IMAGE_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/x-webp",
    "image/gif",
}

GENERIC_IMAGE_TYPES = {"application/octet-stream", "binary/octet-stream"}
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024
DETECTED_TO_EXT = {"png": ".png", "jpeg": ".jpg", "webp": ".webp", "gif": ".gif"}
DEFAULT_AVATAR = "avatar_1.png"
CUSTOM_AVATAR_PREFIX = "user_avatars/"
AVATAR_NAME_RE = re.compile(
    r"^(avatar_[0-9]{1,2}\.png|user_avatars/[a-zA-Z0-9_-]{8,64}\.(png|jpg|jpeg|webp|gif))$"
)

class ProfileUpdate(BaseModel):
    status: str | None = None
    avatar: str | None = None

def _normalize_content_type(content_type: str | None) -> str:
    return str(content_type or "").split(";")[0].strip().lower()

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

def _is_custom_avatar(avatar: str) -> bool:
    return avatar.startswith(CUSTOM_AVATAR_PREFIX)

def _touch_avatar_history(cursor, user_id: int, avatar: str) -> None:
    cursor.execute(
        """
        INSERT INTO user_avatar_history (user_id, avatar)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE last_used_at = CURRENT_TIMESTAMP
        """,
        (user_id, avatar),
    )

def _ensure_avatar_history_row(cursor, user_id: int, avatar: str) -> None:
    cursor.execute(
        "INSERT IGNORE INTO user_avatar_history (user_id, avatar) VALUES (%s, %s)",
        (user_id, avatar),
    )


def _assert_avatar_can_be_used(cursor, user_id: int, avatar: str) -> None:
    if not _is_custom_avatar(avatar):
        return

    cursor.execute(
        "SELECT 1 FROM user_avatar_history WHERE user_id = %s AND avatar = %s LIMIT 1",
        (user_id, avatar),
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="Avatar is not available for current user")

    avatar_file = USER_AVATARS_DIR / Path(avatar).name
    if not avatar_file.exists():
        raise HTTPException(status_code=404, detail="Avatar file not found")


def _upsert_profile(
    user_id: int,
    username: str,
    status: str | None,
    avatar: str | None,
    allow_new_custom_avatar: bool = False,
) -> None:
    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute("SELECT id, avatar FROM user_profiles WHERE user_id = %s", (user_id,))
        exists = cursor.fetchone()

        if exists:
            if status is not None:
                cursor.execute(
                    "UPDATE user_profiles SET status = %s WHERE user_id = %s",
                    (status, user_id),
                )
            if avatar is not None:
                previous_avatar = (exists.get("avatar") or "").strip()
                if previous_avatar and AVATAR_NAME_RE.match(previous_avatar):
                    _touch_avatar_history(cursor, user_id, previous_avatar)
                if _is_custom_avatar(avatar) and not allow_new_custom_avatar:
                    _assert_avatar_can_be_used(cursor, user_id, avatar)
                cursor.execute(
                    "UPDATE user_profiles SET avatar = %s WHERE user_id = %s",
                    (avatar, user_id),
                )
                _touch_avatar_history(cursor, user_id, avatar)
        else:
            avatar_to_save = avatar or DEFAULT_AVATAR
            cursor.execute(
                "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
                (user_id, username, status or "online", avatar_to_save),
            )
            _touch_avatar_history(cursor, user_id, avatar_to_save)

        conn.commit()
    finally:
        cursor.close()
        conn.close()


def _ensure_profile_and_history(user_id: int, username: str) -> str:
    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute("SELECT avatar FROM user_profiles WHERE user_id = %s", (user_id,))
        profile_row = cursor.fetchone()

        if not profile_row:
            current_avatar = DEFAULT_AVATAR
            cursor.execute(
                "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
                (user_id, username, "online", current_avatar),
            )
        else:
            current_avatar = (profile_row.get("avatar") or "").strip() or DEFAULT_AVATAR
            if not AVATAR_NAME_RE.match(current_avatar):
                current_avatar = DEFAULT_AVATAR
            if profile_row.get("avatar") != current_avatar:
                cursor.execute(
                    "UPDATE user_profiles SET avatar = %s WHERE user_id = %s",
                    (current_avatar, user_id),
                )

        _ensure_avatar_history_row(cursor, user_id, current_avatar)
        conn.commit()
        return current_avatar
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


@router.get("/users/profile/avatar/history")
def get_avatar_history(token: str = Depends(get_token_from_cookie)):
    payload = verify_token(token)
    username: str = payload.get("sub")
    user_id = _get_user_id_by_username(username)

    current_avatar = _ensure_profile_and_history(user_id, username)

    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute(
            """
            SELECT id, avatar, created_at, last_used_at
            FROM user_avatar_history
            WHERE user_id = %s
            ORDER BY last_used_at DESC, id DESC
            """,
            (user_id,),
        )
        rows = cursor.fetchall() or []
    finally:
        cursor.close()
        conn.close()

    items = []
    for row in rows:
        avatar = row["avatar"]
        items.append(
            {
                "id": int(row["id"]),
                "avatar": avatar,
                "is_current": avatar == current_avatar,
                "is_custom": _is_custom_avatar(avatar),
                "can_delete": avatar != current_avatar,
                "created_at": row["created_at"],
                "last_used_at": row["last_used_at"],
            }
        )

    return {"current_avatar": current_avatar, "items": items}


@router.delete("/users/profile/avatar/history/{history_id}")
def delete_avatar_history_item(history_id: int, token: str = Depends(get_token_from_cookie)):
    payload = verify_token(token)
    username: str = payload.get("sub")
    user_id = _get_user_id_by_username(username)

    current_avatar = _ensure_profile_and_history(user_id, username)

    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        cursor.execute(
            "SELECT id, avatar FROM user_avatar_history WHERE id = %s AND user_id = %s",
            (history_id, user_id),
        )
        item = cursor.fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Avatar history item not found")

        avatar = item["avatar"]
        if avatar == current_avatar:
            raise HTTPException(status_code=400, detail="Current avatar cannot be deleted")

        cursor.execute(
            "DELETE FROM user_avatar_history WHERE id = %s AND user_id = %s",
            (history_id, user_id),
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

    should_remove_file = False
    if _is_custom_avatar(avatar):
        conn = db.get_connection()
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        try:
            cursor.execute(
                "SELECT 1 FROM user_avatar_history WHERE avatar = %s LIMIT 1",
                (avatar,),
            )
            used_in_history = cursor.fetchone()

            cursor.execute(
                "SELECT 1 FROM user_profiles WHERE avatar = %s LIMIT 1",
                (avatar,),
            )
            used_in_profiles = cursor.fetchone()
        finally:
            cursor.close()
            conn.close()

        should_remove_file = not used_in_history and not used_in_profiles

    if should_remove_file:
        avatar_file = USER_AVATARS_DIR / Path(avatar).name
        if avatar_file.is_file():
            try:
                avatar_file.unlink()
            except OSError:
                pass

    return {"ok": True, "deleted_id": history_id, "avatar": avatar}


@router.post("/users/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    token: str = Depends(get_token_from_cookie),
):
    payload = verify_token(token)
    username: str = payload.get("sub")
    user_id = _get_user_id_by_username(username)

    original_name = file.filename or ""
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Unsupported image extension")

    content_type = _normalize_content_type(file.content_type)
    if (
        content_type
        and content_type not in ALLOWED_IMAGE_TYPES
        and content_type not in GENERIC_IMAGE_TYPES
    ):
        raise HTTPException(status_code=400, detail="Unsupported image type")

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

    try:
        _upsert_profile(user_id, username, None, relative_path, allow_new_custom_avatar=True)
    except Exception:
        if abs_path.exists():
            try:
                abs_path.unlink()
            except OSError:
                pass
        raise

    return {"ok": True, "avatar": relative_path}
