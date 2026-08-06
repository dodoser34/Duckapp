import datetime
import html
import os
import re
import secrets
import smtplib
from email.message import EmailMessage
from pathlib import Path

import bcrypt
import jwt
import pymysql
from dotenv import load_dotenv
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from core.config import env_bool, env_positive_int, public_avatar, require_secret
from core.logging_config import get_logger
from core.ratelimit import RateLimiter
from core.timeutils import utc_now, utc_now_naive
from core.web import client_ip
from databases import db_manager as db
from routers.common import database_http_error

load_dotenv()

router = APIRouter()
log = get_logger("auth")

# Fails fast at import time. The previous ``str(os.getenv("JWT_KEY"))`` turned a
# missing variable into the literal string "None", which anyone could guess.
SECRET_KEY = require_secret("JWT_KEY")
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = env_positive_int("DUCKAPP_TOKEN_TTL_SECONDS", 2 * 60 * 60)

USE_SECURE_COOKIES = env_bool("DUCKAPP_SECURE_COOKIES")
COOKIE_NAME = "access_token"
COOKIE_PATH = os.getenv("DUCKAPP_COOKIE_PATH", "/").strip() or "/"
COOKIE_DOMAIN = (os.getenv("DUCKAPP_COOKIE_DOMAIN") or "").strip() or None
_COOKIE_SAMESITE_RAW = os.getenv("DUCKAPP_COOKIE_SAMESITE", "lax").strip().lower()
COOKIE_SAMESITE = _COOKIE_SAMESITE_RAW if _COOKIE_SAMESITE_RAW in {"lax", "strict", "none"} else "lax"
if COOKIE_SAMESITE == "none" and not USE_SECURE_COOKIES:
    log.warning("SameSite=None requires Secure cookies; falling back to SameSite=Lax")
    COOKIE_SAMESITE = "lax"

USERNAME_MAX_LENGTH = 32
USERNAME_MIN_LENGTH = 3
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
EMAIL_MAX_LENGTH = 100
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
RECOVERY_CODE_LENGTH = 6
RECOVERY_CODE_TTL_MINUTES = env_positive_int("DUCKAPP_RECOVERY_CODE_TTL_MINUTES", 20)
RECOVERY_CODE_MAX_ATTEMPTS = env_positive_int("DUCKAPP_RECOVERY_CODE_MAX_ATTEMPTS", 5)

_auth_limiter = RateLimiter(
    window_seconds=env_positive_int("DUCKAPP_AUTH_RATE_LIMIT_WINDOW_SECONDS", 300),
    max_events=env_positive_int("DUCKAPP_AUTH_RATE_LIMIT_MAX_ATTEMPTS", 30),
)

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_HTML_DIR = BASE_DIR / "frontend" / "html"

# Passwords that pass a naive length check but are the first thing tried.
_WEAK_PASSWORDS = {
    "password", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
    "password1", "iloveyou", "abc12345", "11111111", "00000000", "letmein1",
}


def _enforce_auth_rate_limit(request: Request, identity: str | None = None) -> None:
    keys = [f"ip:{client_ip(request)}"]
    if identity:
        keys.append(f"id:{identity.strip().lower()}")
    if not _auth_limiter.check(keys):
        log.warning("Auth rate limit hit for %s", keys)
        raise HTTPException(status_code=429, detail="Too many authentication attempts")


def _set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=TOKEN_TTL_SECONDS,
        expires=TOKEN_TTL_SECONDS,
        samesite=COOKIE_SAMESITE,
        secure=USE_SECURE_COOKIES,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
    )


def _delete_access_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=USE_SECURE_COOKIES,
    )


def _validate_username_or_400(username: str) -> str:
    value = str(username or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Username is required")
    if not USERNAME_RE.fullmatch(value):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Username must be {USERNAME_MIN_LENGTH}-{USERNAME_MAX_LENGTH} characters "
                f"and may contain only letters, digits, dot, underscore and hyphen"
            ),
        )
    return value


def _validate_password_or_400(password: str) -> str:
    value = str(password or "")
    if len(value) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {PASSWORD_MIN_LENGTH} characters long",
        )
    # bcrypt silently truncates at 72 bytes, so reject rather than mislead.
    if len(value.encode("utf-8")) > PASSWORD_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Password is too long")
    if value.lower() in _WEAK_PASSWORDS:
        raise HTTPException(status_code=400, detail="Password is too common")
    if len(set(value)) == 1:
        raise HTTPException(status_code=400, detail="Password is too common")
    return value


def _normalize_email_or_400(email: str) -> str:
    value = str(email or "").strip()
    if not value or len(value) > EMAIL_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid email address")

    try:
        normalized = validate_email(value, check_deliverability=False).normalized
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="Invalid email address") from None

    if len(normalized) > EMAIL_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid email address")
    return normalized


def _generate_recovery_code() -> str:
    upper_bound = 10 ** RECOVERY_CODE_LENGTH
    return f"{secrets.randbelow(upper_bound):0{RECOVERY_CODE_LENGTH}d}"


def _hash_secret(value: str) -> str:
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_secret(value: str, hashed_value: str) -> bool:
    try:
        return bcrypt.checkpw(value.encode("utf-8"), hashed_value.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def _smtp_host() -> str:
    return (os.getenv("DUCKAPP_SMTP_HOST") or "").strip()


def _recovery_delivery_available() -> bool:
    if not _smtp_host():
        return False
    sender = (os.getenv("DUCKAPP_SMTP_FROM") or os.getenv("DUCKAPP_SMTP_USER") or "").strip()
    return bool(sender)


def _send_recovery_email(email: str, username: str, code: str) -> None:
    host = _smtp_host()
    if not host:
        raise HTTPException(status_code=503, detail="Email delivery is not configured")

    port = env_positive_int("DUCKAPP_SMTP_PORT", 587)
    sender = (os.getenv("DUCKAPP_SMTP_FROM") or os.getenv("DUCKAPP_SMTP_USER") or "").strip()
    username_env = (os.getenv("DUCKAPP_SMTP_USER") or "").strip()
    password_env = os.getenv("DUCKAPP_SMTP_PASSWORD") or ""
    use_ssl = env_bool("DUCKAPP_SMTP_SSL", port == 465)
    use_starttls = env_bool("DUCKAPP_SMTP_STARTTLS", not use_ssl)

    if not sender:
        raise HTTPException(status_code=503, detail="Email delivery is not configured")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = email
    message["Subject"] = "DuckApp account recovery code"
    text_body = "\n".join(
        [
            f"Hello, {username}.",
            "",
            f"Your DuckApp recovery code is: {code}",
            f"The code expires in {RECOVERY_CODE_TTL_MINUTES} minutes.",
            "",
            "If you did not request this code, ignore this email.",
        ]
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #172033;">
        <h2>DuckApp account recovery</h2>
        <p>Hello, {html.escape(username)}.</p>
        <p>Your recovery code:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{html.escape(code)}</p>
        <p>The code expires in {RECOVERY_CODE_TTL_MINUTES} minutes.</p>
        <p>If you did not request this code, ignore this email.</p>
      </body>
    </html>
    """
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=12) as smtp:
                if username_env:
                    smtp.login(username_env, password_env)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=12) as smtp:
                if use_starttls:
                    smtp.starttls()
                if username_env:
                    smtp.login(username_env, password_env)
                smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        log.error("Recovery email to %s failed: %s", email, error)
        raise HTTPException(status_code=503, detail="Could not send recovery email") from None


def _cleanup_recovery_codes(cursor) -> None:
    cursor.execute(
        """
        DELETE FROM account_recovery_codes
        WHERE expires_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)
            OR (used_at IS NOT NULL AND used_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY))
        """
    )


def _set_profile_status_by_username(username: str, status: str) -> None:
    try:
        with db.transaction() as (conn, cursor):
            cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
            user = cursor.fetchone()
            if not user:
                return
            cursor.execute(
                "UPDATE user_profiles SET status = %s WHERE user_id = %s",
                (status, user["id"]),
            )
    except pymysql.MySQLError:
        # Presence is cosmetic: never fail a login/logout because of it.
        log.warning("Could not set status %r for %s", status, username, exc_info=True)


def _issue_token(username: str, token_version: int) -> str:
    now = utc_now()
    payload = {
        "sub": username,
        "ver": int(token_version),
        "iat": now,
        "exp": now + datetime.timedelta(seconds=TOKEN_TTL_SECONDS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            # Without this a token minted with no exp would live forever.
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired") from None
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token") from None


def get_token_from_cookie(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def _load_user_for_token(payload: dict, columns: str) -> dict:
    """Resolve the token subject, rejecting tokens issued before a reset."""
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        with db.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT {columns} FROM registered_users ru "
                    f"LEFT JOIN user_profiles up ON ru.id = up.user_id "
                    f"WHERE ru.username = %s",
                    (username,),
                )
                user = cursor.fetchone()
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Database unavailable while resolving %s", username, exc_info=True)
        raise database_http_error(error) from None

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if int(user.get("token_version") or 0) != int(payload.get("ver") or 0):
        raise HTTPException(status_code=401, detail="Session is no longer valid")

    return user


def get_current_user(request: Request) -> dict:
    payload = verify_token(get_token_from_cookie(request))
    return _load_user_for_token(
        payload,
        "ru.id, ru.username, ru.email, ru.created_at, ru.token_version",
    )


@router.post("/register")
def register(
    request: Request,
    response: Response,
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
):
    username = _validate_username_or_400(username)
    email = _normalize_email_or_400(email)
    password = _validate_password_or_400(password)
    _enforce_auth_rate_limit(request, username)

    hashed = _hash_secret(password)

    try:
        # One transaction: a crash midway used to leave a user with no profile.
        with db.transaction() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO registered_users (username, email, hashed_password, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (username, email, hashed, utc_now_naive()),
            )
            user_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
                (user_id, username, "online", public_avatar(None)),
            )
            cursor.execute(
                "INSERT INTO user_avatar_history (user_id, avatar) VALUES (%s, %s)",
                (user_id, public_avatar(None)),
            )
    except pymysql.err.IntegrityError:
        # Do not parse the driver's error text; ask the database instead.
        raise HTTPException(
            status_code=400,
            detail="A user with this username or email already exists",
        ) from None
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Registration failed for %s", username, exc_info=True)
        raise database_http_error(error) from None

    _set_access_cookie(response, _issue_token(username, 0))
    log.info("Registered user %s (id=%s)", username, user_id)
    return {"message": "User registered successfully"}


@router.post("/login")
def login_api(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
):
    username = str(username or "").strip()
    _enforce_auth_rate_limit(request, username)

    if not username or len(username) > USERNAME_MAX_LENGTH:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    try:
        with db.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, username, hashed_password, token_version "
                    "FROM registered_users WHERE username = %s",
                    (username,),
                )
                user = cursor.fetchone()
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Login failed for %s: database error", username, exc_info=True)
        raise database_http_error(error) from None

    if not user or not _verify_secret(password, user["hashed_password"]):
        log.info("Failed login for %r from %s", username, client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _set_profile_status_by_username(user["username"], "online")
    _auth_limiter.reset(f"id:{username.lower()}")

    _set_access_cookie(response, _issue_token(user["username"], user["token_version"]))
    log.info("User %s signed in", user["username"])
    return {"status": "ok"}


@router.post("/logout")
def logout(response: Response, request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        try:
            payload = verify_token(token)
            username = payload.get("sub")
            if username:
                _set_profile_status_by_username(username, "offline")
        except HTTPException:
            pass

    _delete_access_cookie(response)
    return {"message": "Logged out"}


@router.get("/me")
def get_me(token: str = Depends(get_token_from_cookie)):
    payload = verify_token(token)
    user = _load_user_for_token(
        payload,
        "ru.id, ru.username, ru.email, ru.created_at, ru.token_version, "
        "up.names, up.avatar, up.status",
    )

    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "created_at": user["created_at"],
        "names": user.get("names") or user["username"],
        "avatar": public_avatar(user.get("avatar")),
        "status": user.get("status") or "online",
    }


@router.get("/check")
def check_token(request: Request):
    payload = verify_token(get_token_from_cookie(request))
    _load_user_for_token(payload, "ru.id, ru.token_version")
    return {"status": "ok"}


@router.post("/recovery/request")
def request_account_recovery(request: Request, email: str = Form(...)):
    email = _normalize_email_or_400(email)
    _enforce_auth_rate_limit(request, email)

    if not _recovery_delivery_available():
        raise HTTPException(status_code=503, detail="Email delivery is not configured")

    code = ""
    code_id = None
    user = None

    try:
        with db.transaction() as (conn, cursor):
            _cleanup_recovery_codes(cursor)
            cursor.execute(
                "SELECT id, username, email FROM registered_users WHERE email = %s",
                (email,),
            )
            user = cursor.fetchone()

            if user:
                code = _generate_recovery_code()
                expires_at = utc_now_naive() + datetime.timedelta(
                    minutes=RECOVERY_CODE_TTL_MINUTES
                )
                cursor.execute(
                    """
                    UPDATE account_recovery_codes
                    SET used_at = UTC_TIMESTAMP()
                    WHERE user_id = %s AND used_at IS NULL
                    """,
                    (user["id"],),
                )
                cursor.execute(
                    """
                    INSERT INTO account_recovery_codes (user_id, email, code_hash, expires_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user["id"], user["email"], _hash_secret(code), expires_at),
                )
                code_id = cursor.lastrowid
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Recovery request failed for %s", email, exc_info=True)
        raise database_http_error(error) from None

    if user and code:
        try:
            _send_recovery_email(user["email"], user["username"], code)
        except HTTPException:
            if code_id:
                try:
                    with db.transaction() as (conn, cursor):
                        cursor.execute(
                            "UPDATE account_recovery_codes SET used_at = UTC_TIMESTAMP() "
                            "WHERE id = %s",
                            (code_id,),
                        )
                except pymysql.MySQLError:
                    log.warning("Could not invalidate unsent code %s", code_id, exc_info=True)
            raise

    # Always the same answer, so the endpoint cannot enumerate accounts.
    return {
        "ok": True,
        "message": "If an account with this email exists, a recovery code has been sent",
    }


@router.post("/recovery/reset")
def reset_account_credentials(
    request: Request,
    email: str = Form(...),
    code: str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
):
    email = _normalize_email_or_400(email)
    code = str(code or "").strip()
    username = _validate_username_or_400(username)
    password = _validate_password_or_400(password)

    if not re.fullmatch(rf"\d{{{RECOVERY_CODE_LENGTH}}}", code):
        raise HTTPException(status_code=400, detail="Invalid or expired recovery code")

    _enforce_auth_rate_limit(request, email)

    hashed = _hash_secret(password)
    invalid_code = HTTPException(status_code=400, detail="Invalid or expired recovery code")

    # Phase 1 commits on its own. Folding it into the update transaction would
    # mean a wrong code rolls back its own attempt counter, handing an attacker
    # unlimited guesses.
    try:
        with db.transaction() as (conn, cursor):
            _cleanup_recovery_codes(cursor)
            cursor.execute(
                """
                SELECT id, user_id, code_hash, attempts
                FROM account_recovery_codes
                WHERE email = %s
                    AND used_at IS NULL
                    AND expires_at > UTC_TIMESTAMP()
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                FOR UPDATE
                """,
                (email,),
            )
            recovery = cursor.fetchone()

            code_accepted = False
            if recovery:
                attempts = int(recovery["attempts"])
                if attempts >= RECOVERY_CODE_MAX_ATTEMPTS:
                    cursor.execute(
                        "UPDATE account_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE id = %s",
                        (recovery["id"],),
                    )
                elif _verify_secret(code, recovery["code_hash"]):
                    code_accepted = True
                else:
                    next_attempts = attempts + 1
                    used_at = (
                        ", used_at = UTC_TIMESTAMP()"
                        if next_attempts >= RECOVERY_CODE_MAX_ATTEMPTS
                        else ""
                    )
                    cursor.execute(
                        f"UPDATE account_recovery_codes SET attempts = %s{used_at} WHERE id = %s",
                        (next_attempts, recovery["id"]),
                    )
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Account reset lookup failed for %s", email, exc_info=True)
        raise database_http_error(error) from None

    if not code_accepted:
        log.info("Rejected recovery attempt for %s from %s", email, client_ip(request))
        raise invalid_code

    # Phase 2: apply the new credentials.
    try:
        with db.transaction() as (conn, cursor):
            # Bumping token_version logs out every session that is already out
            # there, which is the whole point of a credential reset.
            cursor.execute(
                """
                UPDATE registered_users
                SET username = %s, hashed_password = %s, token_version = token_version + 1
                WHERE id = %s
                """,
                (username, hashed, recovery["user_id"]),
            )
            cursor.execute(
                "UPDATE user_profiles SET names = %s WHERE user_id = %s",
                (username, recovery["user_id"]),
            )
            cursor.execute(
                """
                UPDATE account_recovery_codes SET used_at = UTC_TIMESTAMP()
                WHERE id = %s AND used_at IS NULL
                """,
                (recovery["id"],),
            )
            if cursor.rowcount == 0:
                # Another request consumed the same code first.
                raise invalid_code
    except HTTPException:
        raise
    except pymysql.err.IntegrityError:
        raise HTTPException(status_code=400, detail="Username is already taken") from None
    except (pymysql.MySQLError, TimeoutError) as error:
        log.error("Account reset failed for %s", email, exc_info=True)
        raise database_http_error(error) from None

    log.info(
        "Credentials reset for user id=%s (all sessions invalidated)", recovery["user_id"]
    )
    return {"ok": True, "username": username}


# The HTML itself is served as a static tree (see start_app.py); these two
# routes stay only so old bookmarks keep working.
@router.get("/login", include_in_schema=False)
def login_page():
    return RedirectResponse("/html/authorization-frame.html", status_code=307)


@router.get("/chat", include_in_schema=False)
def chat_page(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return RedirectResponse("/html/authorization-frame.html", status_code=307)
    try:
        verify_token(token)
    except HTTPException:
        return RedirectResponse("/html/authorization-frame.html", status_code=307)
    return RedirectResponse("/html/main-chat.html", status_code=307)
