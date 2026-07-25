import datetime
import html
import os
import re
import secrets
import smtplib
import time
from collections import deque
from email.message import EmailMessage
from pathlib import Path
from threading import Lock

import bcrypt
import jwt
import pymysql
from dotenv import load_dotenv
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from databases import db_manager as db

load_dotenv()

router = APIRouter()


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return max(1, value)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY: str = str(os.getenv("JWT_KEY"))
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 2 * 60 * 60
USE_SECURE_COOKIES = _env_bool("DUCKAPP_SECURE_COOKIES")
COOKIE_NAME = "access_token"
COOKIE_PATH = os.getenv("DUCKAPP_COOKIE_PATH", "/").strip() or "/"
COOKIE_DOMAIN = (os.getenv("DUCKAPP_COOKIE_DOMAIN") or "").strip() or None
_COOKIE_SAMESITE_RAW = os.getenv("DUCKAPP_COOKIE_SAMESITE", "lax").strip().lower()
COOKIE_SAMESITE = _COOKIE_SAMESITE_RAW if _COOKIE_SAMESITE_RAW in {"lax", "strict", "none"} else "lax"
if COOKIE_SAMESITE == "none" and not USE_SECURE_COOKIES:
    COOKIE_SAMESITE = "lax"
AUTH_RATE_LIMIT_WINDOW_SECONDS = _env_positive_int(
    "DUCKAPP_AUTH_RATE_LIMIT_WINDOW_SECONDS", 300
)
AUTH_RATE_LIMIT_MAX_ATTEMPTS = _env_positive_int(
    "DUCKAPP_AUTH_RATE_LIMIT_MAX_ATTEMPTS", 30
)
AUTH_TRUST_PROXY_HEADERS = os.getenv("DUCKAPP_TRUST_PROXY_HEADERS", "0").strip().lower() in {
    "1",
    "true",
    "yes",
}
USERNAME_MAX_LENGTH = 32
EMAIL_MAX_LENGTH = 100
RECOVERY_CODE_LENGTH = 6
RECOVERY_CODE_TTL_MINUTES = _env_positive_int("DUCKAPP_RECOVERY_CODE_TTL_MINUTES", 20)
RECOVERY_CODE_MAX_ATTEMPTS = _env_positive_int("DUCKAPP_RECOVERY_CODE_MAX_ATTEMPTS", 5)

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_HTML_DIR = BASE_DIR / "frontend" / "html"
_AUTH_RATE_BUCKETS: dict[str, deque[float]] = {}
_AUTH_RATE_LOCK = Lock()
DEFAULT_AVATAR = "avatar_1.png"
PUBLIC_AVATAR_RE = re.compile(
    r"^(avatar_[0-9]{1,2}\.png|user_avatars/[a-zA-Z0-9_-]{8,64}\.(png|jpg|jpeg|webp|gif))$"
)


def read_html_file(filename: str) -> str:
    path = FRONTEND_HTML_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"HTML file not found: {filename}")
    return path.read_text(encoding="utf-8")


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


def _client_ip(request: Request) -> str:
    if AUTH_TRUST_PROXY_HEADERS:
        forwarded_for = (request.headers.get("x-forwarded-for") or "").strip()
        if forwarded_for:
            return forwarded_for.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _enforce_auth_rate_limit(request: Request, username: str | None = None) -> None:
    now = time.monotonic()
    keys = [f"ip:{_client_ip(request)}"]
    if username:
        keys.append(f"user:{username.strip().lower()}")

    with _AUTH_RATE_LOCK:
        for key in keys:
            bucket = _AUTH_RATE_BUCKETS.get(key)
            if not bucket:
                continue
            while bucket and now - bucket[0] > AUTH_RATE_LIMIT_WINDOW_SECONDS:
                bucket.popleft()
            if len(bucket) >= AUTH_RATE_LIMIT_MAX_ATTEMPTS:
                raise HTTPException(status_code=429, detail="Too many authentication attempts")

        for key in keys:
            bucket = _AUTH_RATE_BUCKETS.setdefault(key, deque())
            bucket.append(now)


def _normalize_email_or_400(email: str) -> str:
    value = str(email or "").strip()
    if not value or len(value) > EMAIL_MAX_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid email address")

    try:
        normalized = validate_email(value, check_deliverability=False).normalized
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="Invalid email address")

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

    port = _env_positive_int("DUCKAPP_SMTP_PORT", 587)
    sender = (os.getenv("DUCKAPP_SMTP_FROM") or os.getenv("DUCKAPP_SMTP_USER") or "").strip()
    username_env = (os.getenv("DUCKAPP_SMTP_USER") or "").strip()
    password_env = os.getenv("DUCKAPP_SMTP_PASSWORD") or ""
    use_ssl = _env_bool("DUCKAPP_SMTP_SSL", port == 465)
    use_starttls = _env_bool("DUCKAPP_SMTP_STARTTLS", not use_ssl)

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
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{code}</p>
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
    except (OSError, smtplib.SMTPException):
        raise HTTPException(status_code=503, detail="Could not send recovery email")


def _cleanup_recovery_codes(cursor) -> None:
    cursor.execute(
        """
        DELETE FROM account_recovery_codes
        WHERE expires_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)
            OR (used_at IS NOT NULL AND used_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY))
        """
    )


def _public_avatar(avatar: str | None) -> str:
    value = (avatar or "").strip()
    if PUBLIC_AVATAR_RE.match(value):
        return value
    return DEFAULT_AVATAR


def _set_profile_status_by_username(username: str, status: str) -> None:
    conn = db.get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
            user = cursor.fetchone()
            if not user:
                return
            user_id = user["id"] if isinstance(user, dict) else user[0]
            cursor.execute(
                "UPDATE user_profiles SET status = %s WHERE user_id = %s",
                (status, user_id),
            )
            conn.commit()
    finally:
        conn.close()


def verify_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_token_from_cookie(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def get_current_user(request: Request):
    token = get_token_from_cookie(request)
    payload = verify_token(token)
    username = payload.get("sub")

    try:
        conn = db.get_connection()
    except pymysql.MySQLError:
        raise HTTPException(status_code=503, detail="Database unavailable")

    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, email, created_at FROM registered_users WHERE username = %s",
        (username,),
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/register")
async def register(
    request: Request,
    response: Response,
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
):
    username = username.strip()
    email = _normalize_email_or_400(email)

    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if len(username) > USERNAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Username must be at most {USERNAME_MAX_LENGTH} characters long",
        )
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    _enforce_auth_rate_limit(request, username)

    conn = db.get_connection()
    cursor = conn.cursor()
    hashed = _hash_secret(password)

    try:
        cursor.execute(
            "INSERT INTO registered_users (username, email, hashed_password, created_at) VALUES (%s, %s, %s, %s)",
            (username, email, hashed, datetime.datetime.utcnow()),
        )
        conn.commit()
        user_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
            (user_id, username, "online", "avatar_1.png"),
        )
        cursor.execute(
            "INSERT INTO user_avatar_history (user_id, avatar) VALUES (%s, %s)",
            (user_id, "avatar_1.png"),
        )
        conn.commit()
    except pymysql.err.IntegrityError as error:
        cursor.close()
        conn.close()
        if "username" in str(error) or "email" in str(error):
            raise HTTPException(status_code=400, detail="A user with this username or email already exists")
        raise HTTPException(status_code=400, detail="Registration failed")

    cursor.close()
    conn.close()

    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    _set_access_cookie(response, token)
    return {"message": "User registered successfully"}


@router.post("/logout")
async def logout(response: Response, request: Request):
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
    username: str = payload.get("sub")

    try:
        conn = db.get_connection()
    except pymysql.MySQLError:
        raise HTTPException(status_code=503, detail="Database unavailable")

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        """
        SELECT
            ru.id,
            ru.username,
            ru.email,
            ru.created_at,
            up.names,
            up.avatar,
            up.status
        FROM registered_users ru
        LEFT JOIN user_profiles up ON ru.id = up.user_id
        WHERE ru.username = %s
        """,
        (username,),
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "created_at": user["created_at"],
        "names": user.get("names") or user["username"],
        "avatar": _public_avatar(user.get("avatar")),
        "status": user.get("status") or "online",
    }


@router.post("/recovery/request")
async def request_account_recovery(
    request: Request,
    email: str = Form(...),
):
    email = _normalize_email_or_400(email)
    _enforce_auth_rate_limit(request, email)

    if not _recovery_delivery_available():
        raise HTTPException(status_code=503, detail="Email delivery is not configured")

    try:
        conn = db.get_connection()
    except pymysql.MySQLError:
        raise HTTPException(status_code=503, detail="Database unavailable")

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    code = ""
    code_id = None
    user = None

    try:
        _cleanup_recovery_codes(cursor)
        cursor.execute(
            "SELECT id, username, email FROM registered_users WHERE email = %s",
            (email,),
        )
        user = cursor.fetchone()

        if user:
            code = _generate_recovery_code()
            expires_at = datetime.datetime.utcnow() + datetime.timedelta(
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

        conn.commit()
    finally:
        cursor.close()
        conn.close()

    if user and code:
        try:
            _send_recovery_email(user["email"], user["username"], code)
        except HTTPException:
            if code_id:
                cleanup_conn = db.get_connection()
                cleanup_cursor = cleanup_conn.cursor()
                try:
                    cleanup_cursor.execute(
                        "UPDATE account_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE id = %s",
                        (code_id,),
                    )
                    cleanup_conn.commit()
                finally:
                    cleanup_cursor.close()
                    cleanup_conn.close()
            raise

    return {
        "ok": True,
        "message": "If an account with this email exists, a recovery code has been sent",
    }


@router.post("/recovery/reset")
async def reset_account_credentials(
    request: Request,
    email: str = Form(...),
    code: str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
):
    email = _normalize_email_or_400(email)
    code = str(code or "").strip()
    username = username.strip()

    if not re.fullmatch(rf"\d{{{RECOVERY_CODE_LENGTH}}}", code):
        raise HTTPException(status_code=400, detail="Invalid or expired recovery code")
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if len(username) > USERNAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Username must be at most {USERNAME_MAX_LENGTH} characters long",
        )
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    _enforce_auth_rate_limit(request, email)

    try:
        conn = db.get_connection()
    except pymysql.MySQLError:
        raise HTTPException(status_code=503, detail="Database unavailable")

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        _cleanup_recovery_codes(cursor)
        cursor.execute(
            """
            SELECT
                arc.id,
                arc.user_id,
                arc.code_hash,
                arc.attempts,
                ru.username AS old_username
            FROM account_recovery_codes arc
            JOIN registered_users ru ON ru.id = arc.user_id
            WHERE arc.email = %s
                AND arc.used_at IS NULL
                AND arc.expires_at > UTC_TIMESTAMP()
            ORDER BY arc.created_at DESC, arc.id DESC
            LIMIT 1
            """,
            (email,),
        )
        recovery = cursor.fetchone()

        if not recovery:
            raise HTTPException(status_code=400, detail="Invalid or expired recovery code")

        if int(recovery["attempts"]) >= RECOVERY_CODE_MAX_ATTEMPTS:
            cursor.execute(
                "UPDATE account_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE id = %s",
                (recovery["id"],),
            )
            conn.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired recovery code")

        if not _verify_secret(code, recovery["code_hash"]):
            next_attempts = int(recovery["attempts"]) + 1
            if next_attempts >= RECOVERY_CODE_MAX_ATTEMPTS:
                cursor.execute(
                    """
                    UPDATE account_recovery_codes
                    SET attempts = %s, used_at = UTC_TIMESTAMP()
                    WHERE id = %s
                    """,
                    (next_attempts, recovery["id"]),
                )
            else:
                cursor.execute(
                    "UPDATE account_recovery_codes SET attempts = %s WHERE id = %s",
                    (next_attempts, recovery["id"]),
                )
            conn.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired recovery code")

        hashed = _hash_secret(password)
        try:
            cursor.execute(
                """
                UPDATE registered_users
                SET username = %s, hashed_password = %s
                WHERE id = %s
                """,
                (username, hashed, recovery["user_id"]),
            )
            cursor.execute(
                "UPDATE user_profiles SET names = %s WHERE user_id = %s",
                (username, recovery["user_id"]),
            )
            cursor.execute(
                "UPDATE account_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE id = %s",
                (recovery["id"],),
            )
            conn.commit()
        except pymysql.err.IntegrityError:
            conn.rollback()
            raise HTTPException(status_code=400, detail="Username is already taken")
    finally:
        cursor.close()
        conn.close()

    return {"ok": True, "username": username}


@router.get("/login", response_class=HTMLResponse)
async def login_page():
    return HTMLResponse(read_html_file("authorization-frame.html"))


@router.post("/login")
async def login_api(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
):
    username = username.strip()
    _enforce_auth_rate_limit(request, username)
    if not username or len(username) > USERNAME_MAX_LENGTH:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT id, username, hashed_password FROM registered_users WHERE username = %s",
        (username,),
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not _verify_secret(password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _set_profile_status_by_username(user["username"], "online")

    payload = {
        "sub": user["username"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    _set_access_cookie(response, token)
    return {"status": "ok"}


@router.get("/check")
async def check_token(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401)

    payload = verify_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401)

    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=401)
    return {"status": "ok"}


@router.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return RedirectResponse("/api/auth/login", 302)

    try:
        verify_token(token)
    except HTTPException:
        return RedirectResponse("/api/auth/login", 302)

    return HTMLResponse(read_html_file("main-chat.html"))
