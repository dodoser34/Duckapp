from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordBearer
from DataBases import db_manager as db
import jwt, datetime

import bcrypt, pymysql

router = APIRouter()

# для получения токена из заголовка Authorization: Bearer <token>
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

SECRET_KEY = "supersecret"  # ⚠️ на проде хранить в .env
ALGORITHM = "HS256"

@router.post("/register")
async def register(username: str = Form(...), email: str = Form(...), password: str = Form(...)):
    conn = db.get_connection()
    cursor = conn.cursor()


    # Создаем bcrypt-хеш пароля
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    hashed_str = hashed.decode("utf-8")  # сохраняем в БД как строку

    # Вставляем пользователя в БД
    try:
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password, created_at) VALUES (%s, %s, %s, %s)",
            (username, email, hashed_str, datetime.datetime.utcnow())
        )
        conn.commit()
    except pymysql.err.IntegrityError as e:
        cursor.close()
        conn.close()
        if "username" in str(e):
            raise HTTPException(status_code=400, detail="Пользователь с таким именем уже существует")
        elif "email" in str(e):
            raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
        else:
            raise HTTPException(status_code=400, detail="Ошибка уникальности данных")
    
    cursor.close()
    conn.close()
    
    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    return {"access_token": token, "token_type": "bearer"}


@router.post("/login")
async def login(username: str = Form(...), password: str = Form(...)):
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["hashed_password"].encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect login or password",
        )

    # создаём JWT токен
    payload = {
        "sub": user["username"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    return {"access_token": token, "token_type": "bearer"}

# ---------- Проверка токена ----------
def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Неверный токен")

        # получаем пользователя из БД
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if user is None:
            raise HTTPException(status_code=401, detail="Пользователь не найден")

        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Токен истёк")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Неверный токен")
