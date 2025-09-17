from fastapi import APIRouter, Depends, HTTPException, status, Form, Response, Request
from DataBases import db_manager as db
import jwt, datetime, bcrypt, pymysql, os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

SECRET_KEY = os.getenv("JWT_KEY")
ALGORITHM = "HS256"

#! ---------- REGISTER ----------
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

#! ---------- LOGIN ----------
@router.post("/login")
async def login(response: Response, username: str = Form(...), password: str = Form(...)):
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM registered_users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["hashed_password"].encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect login or password")

    payload = {
        "sub": user["username"],
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

    return {"message": "Logged in successfully"}

#! ---------- LOGOUT ----------
@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}

#! ---------- Проверка токена ----------
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

    conn = db.get_connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)  # чтобы сразу dict приходил

    # JOIN для профиля
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
        LEFT JOIN user_profiles up ON ru.id = up.id
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
        "names": user.get("names") or user["username"],  # если профиля нет → username
        "avatar": user.get("avatar") or "../assets/avatar_1.png",  # дефолтная аватарка
        "status": user.get("status") or "online"
    }

def get_current_user(request: Request):
    token = get_token_from_cookie(request)
    payload = verify_token(token)
    username = payload.get("sub")

    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, created_at FROM registered_users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user