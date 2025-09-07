from fastapi import FastAPI, Depends
from DataBases import db_manager as db
from routers.auth import get_current_user
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    # при старте приложения
    db.init_db()
    yield
    # при завершении приложения (например, можно закрыть соединение с БД)
    # db.close()


app = FastAPI(title="DuckApp Messenger", lifespan=lifespan)

# Разрешаем фронту коннектиться
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # на проде лучше ограничить
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем маршруты авторизации
app.include_router(auth.router, prefix="/api/auth")


@app.get("/api/users/me")
async def read_me(user=Depends(get_current_user)):
    return user


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)