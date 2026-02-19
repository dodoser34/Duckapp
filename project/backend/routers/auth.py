from fastapi import APIRouter, Depends, HTTPException, status, Form, Response, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from DataBases import db_manager as db
import jwt, datetime, bcrypt, pymysql, os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

router = APIRouter()

SECRET_KEY: str = str(os.getenv("JWT_KEY"))
ALGORITHM = "HS256"

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

@router.post("/register")
async def register(response: Response, username: str = Form(...), email: str = Form(...), password: str = Form(...)):
    conn = db.get_connection()
    cursor = conn.cursor()

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    try:
        cursor.execute(
            "INSERT INTO registered_users (username, email, hashed_password, created_at) VALUES (%s, %s, %s, %s)",
            (username, email, hashed, datetime.datetime.utcnow())
        )
        conn.commit()

        user_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO user_profiles (user_id, names, status, avatar) VALUES (%s, %s, %s, %s)",
            (user_id, username, "online", "avatar_1.png")
        )
        conn.commit()

    except pymysql.err.IntegrityError as e:
        cursor.close()
        conn.close()
        if "username" in str(e):
            raise HTTPException(status_code=400, detail="A user with this username already exists")
        elif "email" in str(e):
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        else:
            raise HTTPException(status_code=400, detail="Data uniqueness error")

    cursor.close()
    conn.close()

    # JWT токен
    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=10800,
        samesite="lax",
        secure=False
    )

    return {"message": "User registered successfully"}

#! ---------- LOGOUT ----------
@router.post("/logout")
async def logout(response: Response, request: Request):
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = verify_token(token)
            username = payload.get("sub")
            if username:
                conn = db.get_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
                user = cursor.fetchone()
                if user:
                    user_id = user["id"] if isinstance(user, dict) else user[0]
                    cursor.execute(
                        "UPDATE user_profiles SET status = %s WHERE user_id = %s",
                        ("offline", user_id),
                    )
                    conn.commit()
                cursor.close()
                conn.close()
        except Exception:
            pass

    response.delete_cookie("access_token")
    return {"message": "Logged out"}

#! ---------- Token verification ----------
def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_token_from_cookie(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token

#! ---------- /me ----------
@router.get("/me")
def get_me(token: str = Depends(get_token_from_cookie)):
    payload = verify_token(token)
    username: str = payload.get("sub")

    try:
        conn = db.get_connection()
    except pymysql.MySQLError:
        raise HTTPException(status_code=503, detail="Database unavailable")
    cursor = conn.cursor(pymysql.cursors.DictCursor)  
    cursor.execute("""
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
    """, (username,))
    
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
        "status": user.get("status") or "online"
    }

def get_current_user(request: Request):
    token = get_token_from_cookie(request)
    payload = verify_token(token)
    username = payload.get("sub")

    try:
        conn = db.get_connection()
    except pymysql.MySQLError:
        raise HTTPException(status_code=503, detail="Database unavailable")
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, created_at FROM registered_users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user





#! ---------- LOGIN PAGE ----------
@router.get("/login", response_class=HTMLResponse)
async def login_page():
    return HTMLResponse(
        open("static/login.html", encoding="utf-8").read()
    )


#! ---------- LOGIN API ----------
@router.post("/login")
async def login_api(
    response: Response,
    username: str = Form(...),
    password: str = Form(...)
):
    
    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)

    cursor.execute(
        "SELECT username, hashed_password FROM registered_users WHERE username = %s",
        (username,)
    )
    user = cursor.fetchone()

    cursor.close()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not bcrypt.checkpw(password.encode(), user["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    conn2 = db.get_connection()
    cursor2 = conn2.cursor()
    cursor2.execute("SELECT id FROM registered_users WHERE username = %s", (username,))
    user_row = cursor2.fetchone()
    if user_row:
        user_id = user_row["id"] if isinstance(user_row, dict) else user_row[0]
        cursor2.execute(
            "UPDATE user_profiles SET status = %s WHERE user_id = %s",
            ("online", user_id),
        )
        conn2.commit()
    cursor2.close()
    conn2.close()
    
    payload = {
        "sub": user["username"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=7200,
        samesite="lax",
        secure=False
    )

    return {"status": "ok"}

    

#! ---------- TOKEN CHECK ----------
@router.get("/check")
async def check_token(request: Request):
    token = request.cookies.get("access_token")
    
    if not token:
        raise HTTPException(status_code=401)

    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"status": "ok"}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401)

    
#! ---------- CHAT PAGE ----------
@router.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse("/api/auth/login", 302)

    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return RedirectResponse("/api/auth/login", 302)

    return HTMLResponse(
        open("static/main_chat.html", encoding="utf-8").read()
    )  
