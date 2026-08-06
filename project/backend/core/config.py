"""Shared configuration helpers and value objects.

Everything that used to be copy-pasted across routers lives here: the avatar
name pattern, the env parsers and the public projections of user-controlled
fields.
"""

import os
import re

DEFAULT_AVATAR = "avatar_1.png"

# Preset avatars ship with the app; uploaded ones are stored under
# ``assets/user_avatars`` with a uuid4 hex name (32 chars).
AVATAR_NAME_RE = re.compile(
    r"^(avatar_[0-9]{1,2}\.png|user_avatars/[a-zA-Z0-9_-]{8,64}\.(png|jpg|jpeg|webp|gif))$"
)

PUBLIC_STATUSES = {"online", "dnd"}
ALLOWED_STATUSES = {"online", "invisible", "dnd", "offline"}


def env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return max(1, value)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def require_secret(name: str) -> str:
    """Read a mandatory secret, refusing to start with a placeholder value.

    Previously ``str(os.getenv("JWT_KEY"))`` silently produced the literal
    string ``"None"`` when the variable was missing, which would have let
    anyone forge tokens.
    """
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is not set. Copy .env.example to .env and fill it in "
            f"with a strong random value."
        )
    if value.lower() in {"none", "changeme", "secret", "test"}:
        raise RuntimeError(f"{name} uses a placeholder value; set a real secret.")
    return value


def public_avatar(avatar: str | None) -> str:
    """Never echo an avatar path that the frontend would refuse to render."""
    value = (avatar or "").strip()
    if AVATAR_NAME_RE.match(value):
        return value
    return DEFAULT_AVATAR


def public_status(status: str | None) -> str:
    """Collapse ``invisible``/``offline`` so peers cannot tell them apart."""
    value = (status or "").strip().lower()
    return value if value in PUBLIC_STATUSES else "offline"
