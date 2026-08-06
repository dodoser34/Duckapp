from imghdr import what as detect_image_type
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from core.config import ALLOWED_STATUSES, AVATAR_NAME_RE, DEFAULT_AVATAR, env_positive_int
from core.logging_config import get_logger
from databases import db_manager as db
from routers.auth import get_token_from_cookie, verify_token

router = APIRouter()
log = get_logger("profile")

BASE_DIR = Path(__file__).resolve().parents[2]
ASSETS_DIR = BASE_DIR / "frontend" / "html" / "assets"
USER_AVATARS_DIR = ASSETS_DIR / "user_avatars"
USER_AVATARS_DIR.mkdir(parents=True, exist_ok=True)

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
MAX_AVATAR_BYTES = env_positive_int("DUCKAPP_MAX_AVATAR_BYTES", 2 * 1024 * 1024)
# Uploads were unlimited: 2 MB x unlimited files x unlimited users.
MAX_CUSTOM_AVATARS_PER_USER = env_positive_int("DUCKAPP_MAX_CUSTOM_AVATARS", 10)
DETECTED_TO_EXT = {"png": ".png", "jpeg": ".jpg", "webp": ".webp", "gif": ".gif"}
CUSTOM_AVATAR_PREFIX = "user_avatars/"


class ProfileUpdate(BaseModel):
    status: str | None = None
    avatar: str | None = None


def _normalize_content_type(content_type: str | None) -> str:
    return str(content_type or "").split(";")[0].strip().lower()


def _is_custom_avatar(avatar: str) -> bool:
    return avatar.startswith(CUSTOM_AVATAR_PREFIX)


def _validate_avatar_name(avatar: str) -> str:
    value = (avatar or "").strip()
    if not AVATAR_NAME_RE.match(value):
        raise HTTPException(status_code=400, detail="Invalid avatar name")
    return value


def _current_username(token: str) -> str:
    payload = verify_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


def _get_user_id(cursor, username: str) -> int:
    cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return int(user["id"])


def _touch_avatar_history(cursor, user_id: int, avatar: str) -> None:
    cursor.execute(
        """
        INSERT INTO user_avatar_history (user_id, avatar)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE last_used_at = CURRENT_TIMESTAMP
        """,
        (user_id, avatar),
    )


def _assert_avatar_can_be_used(cursor, user_id: int, avatar: str) -> None:
    """Custom avatars may only be reused by the account that uploaded them."""
    if not _is_custom_avatar(avatar):
        return

    cursor.execute(
        "SELECT 1 FROM user_avatar_history WHERE user_id = %s AND avatar = %s LIMIT 1",
        (user_id, avatar),
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="Avatar is not available for current user")

    if not (USER_AVATARS_DIR / Path(avatar).name).exists():
        raise HTTPException(status_code=404, detail="Avatar file not found")


def _count_custom_avatars(cursor, user_id: int) -> int:
    cursor.execute(
        "SELECT COUNT(*) AS total FROM user_avatar_history "
        "WHERE user_id = %s AND avatar LIKE %s",
        (user_id, f"{CUSTOM_AVATAR_PREFIX}%"),
    )
    return int((cursor.fetchone() or {}).get("total") or 0)


def _apply_profile(
    cursor,
    user_id: int,
    username: str,
    status: str | None,
    avatar: str | None,
    allow_new_custom_avatar: bool = False,
) -> None:
    cursor.execute("SELECT id, avatar FROM user_profiles WHERE user_id = %s", (user_id,))
    existing = cursor.fetchone()

    if not existing:
        avatar_to_save = avatar or DEFAULT_AVATAR
        cursor.execute(
            "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
            (user_id, username, status or "online", avatar_to_save),
        )
        _touch_avatar_history(cursor, user_id, avatar_to_save)
        return

    if status is not None:
        cursor.execute(
            "UPDATE user_profiles SET status = %s WHERE user_id = %s", (status, user_id)
        )

    if avatar is None:
        return

    previous_avatar = (existing.get("avatar") or "").strip()
    if previous_avatar and AVATAR_NAME_RE.match(previous_avatar):
        _touch_avatar_history(cursor, user_id, previous_avatar)
    if _is_custom_avatar(avatar) and not allow_new_custom_avatar:
        _assert_avatar_can_be_used(cursor, user_id, avatar)

    cursor.execute("UPDATE user_profiles SET avatar = %s WHERE user_id = %s", (avatar, user_id))
    _touch_avatar_history(cursor, user_id, avatar)


def _ensure_profile_and_history(cursor, user_id: int, username: str) -> str:
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

    cursor.execute(
        "INSERT IGNORE INTO user_avatar_history (user_id, avatar) VALUES (%s, %s)",
        (user_id, current_avatar),
    )
    return current_avatar


def _generated_avatar_name(detected_kind: str, uploaded_ext: str) -> str:
    """Build the stored filename from the *sniffed* type, not the client's name.

    The only nuance is cosmetic: a JPEG uploaded as ``.jpeg`` keeps that
    spelling instead of being rewritten to ``.jpg``.
    """
    extension = DETECTED_TO_EXT[detected_kind]
    if detected_kind == "jpeg" and uploaded_ext == ".jpeg":
        extension = ".jpeg"
    return f"{uuid4().hex}{extension}"


@router.patch("/users/profile")
def update_profile(data: ProfileUpdate, token: str = Depends(get_token_from_cookie)):
    username = _current_username(token)

    status = data.status.strip().lower() if data.status else None
    if status is not None and status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    avatar = _validate_avatar_name(data.avatar) if data.avatar else None

    with db.transaction() as (conn, cursor):
        user_id = _get_user_id(cursor, username)
        _apply_profile(cursor, user_id, username, status, avatar)

    return {"message": "Profile updated", "status": status, "avatar": avatar}


@router.get("/users/profile/avatar/history")
def get_avatar_history(token: str = Depends(get_token_from_cookie)):
    username = _current_username(token)

    with db.transaction() as (conn, cursor):
        user_id = _get_user_id(cursor, username)
        current_avatar = _ensure_profile_and_history(cursor, user_id, username)

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
        custom_count = _count_custom_avatars(cursor, user_id)

    items = [
        {
            "id": int(row["id"]),
            "avatar": row["avatar"],
            "is_current": row["avatar"] == current_avatar,
            "is_custom": _is_custom_avatar(row["avatar"]),
            "can_delete": row["avatar"] != current_avatar,
            "created_at": row["created_at"],
            "last_used_at": row["last_used_at"],
        }
        for row in rows
    ]

    return {
        "current_avatar": current_avatar,
        "items": items,
        "custom_used": custom_count,
        "custom_limit": MAX_CUSTOM_AVATARS_PER_USER,
    }


@router.delete("/users/profile/avatar/history/{history_id}")
def delete_avatar_history_item(history_id: int, token: str = Depends(get_token_from_cookie)):
    username = _current_username(token)

    with db.transaction() as (conn, cursor):
        user_id = _get_user_id(cursor, username)
        current_avatar = _ensure_profile_and_history(cursor, user_id, username)

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

        should_remove_file = False
        if _is_custom_avatar(avatar):
            cursor.execute(
                "SELECT 1 FROM user_avatar_history WHERE avatar = %s LIMIT 1", (avatar,)
            )
            used_in_history = cursor.fetchone()
            cursor.execute("SELECT 1 FROM user_profiles WHERE avatar = %s LIMIT 1", (avatar,))
            used_in_profiles = cursor.fetchone()
            should_remove_file = not used_in_history and not used_in_profiles

    if should_remove_file:
        avatar_file = USER_AVATARS_DIR / Path(avatar).name
        if avatar_file.is_file():
            try:
                avatar_file.unlink()
            except OSError:
                log.warning("Could not delete avatar file %s", avatar_file, exc_info=True)

    return {"ok": True, "deleted_id": history_id, "avatar": avatar}


@router.post("/users/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    token: str = Depends(get_token_from_cookie),
):
    username = _current_username(token)

    uploaded_ext = Path(file.filename or "").suffix.lower()
    if uploaded_ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Unsupported image extension")

    content_type = _normalize_content_type(file.content_type)
    if (
        content_type
        and content_type not in ALLOWED_IMAGE_TYPES
        and content_type not in GENERIC_IMAGE_TYPES
    ):
        raise HTTPException(status_code=400, detail="Unsupported image type")

    # Bounded read: never buffer more than the limit plus one byte, so an
    # oversized upload cannot balloon memory before being rejected.
    content = await file.read(MAX_AVATAR_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="Avatar is too large (max 2MB)")

    detected = detect_image_type(None, content)
    if detected not in DETECTED_TO_EXT:
        raise HTTPException(status_code=400, detail="Invalid image file")

    generated = _generated_avatar_name(detected, uploaded_ext)
    relative_path = f"{CUSTOM_AVATAR_PREFIX}{generated}"
    abs_path = USER_AVATARS_DIR / generated

    try:
        with db.transaction() as (conn, cursor):
            user_id = _get_user_id(cursor, username)

            if _count_custom_avatars(cursor, user_id) >= MAX_CUSTOM_AVATARS_PER_USER:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Avatar limit reached ({MAX_CUSTOM_AVATARS_PER_USER}). "
                        f"Delete an uploaded avatar first."
                    ),
                )

            # Write only after the quota check passes, and inside the same unit
            # of work, so a failed commit cannot leave the file behind.
            abs_path.write_bytes(content)
            _apply_profile(
                cursor, user_id, username, None, relative_path, allow_new_custom_avatar=True
            )
    except Exception:
        if abs_path.exists():
            try:
                abs_path.unlink()
            except OSError:
                log.warning("Could not roll back avatar file %s", abs_path, exc_info=True)
        raise

    log.info("User %s uploaded avatar %s", username, relative_path)
    return {"ok": True, "avatar": relative_path}
