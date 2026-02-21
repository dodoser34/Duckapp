import datetime
import os
from pathlib import Path

import bcrypt
import jwt
import pymysql
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from databases import db_manager as db

load_dotenv()

router = APIRouter()

SECRET_KEY: str = str(os.getenv("JWT_KEY"))
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 2 * 60 * 60
USE_SECURE_COOKIES = os.getenv("DUCKAPP_SECURE_COOKIES", "0").strip().lower() in {"1", "true", "yes"}

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_HTML_DIR = BASE_DIR / "frontend" / "html"


def read_html_file(filename: str) -> str:
    path = FRONTEND_HTML_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"HTML file not found: {filename}")
    return path.read_text(encoding="utf-8")


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
    token = request.cookies.get("access_token")
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
    response: Response,
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
):
    conn = db.get_connection()
    cursor = conn.cursor()

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

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
        conn.commit()
    except pymysql.err.IntegrityError as error:
        cursor.close()
        conn.close()
        if "username" in str(error):
            raise HTTPException(status_code=400, detail="A user with this username already exists")
        if "email" in str(error):
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        raise HTTPException(status_code=400, detail="Data uniqueness error")

    cursor.close()
    conn.close()

    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=TOKEN_TTL_SECONDS,
        samesite="lax",
        secure=USE_SECURE_COOKIES,
    )
    return {"message": "User registered successfully"}


@router.post("/logout")
async def logout(response: Response, request: Request):
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = verify_token(token)
            username = payload.get("sub")
            if username:
                _set_profile_status_by_username(username, "offline")
        except HTTPException:
            pass

    response.delete_cookie("access_token")
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
        "avatar": user.get("avatar") or "avatar_1.png",
        "status": user.get("status") or "online",
    }


@router.get("/login", response_class=HTMLResponse)
async def login_page():
    return HTMLResponse(read_html_file("authorization-frame.html"))


@router.post("/login")
async def login_api(
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
):
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
    if not bcrypt.checkpw(password.encode(), user["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _set_profile_status_by_username(user["username"], "online")

    payload = {
        "sub": user["username"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=TOKEN_TTL_SECONDS,
        samesite="lax",
        secure=USE_SECURE_COOKIES,
    )
    return {"status": "ok"}


@router.get("/check")
async def check_token(request: Request):
    token = request.cookies.get("access_token")
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
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse("/api/auth/login", 302)

    try:
        verify_token(token)
    except HTTPException:
        return RedirectResponse("/api/auth/login", 302)

    return HTMLResponse(read_html_file("main-chat.html"))
