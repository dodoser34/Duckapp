from fastapi import FastAPI, Depends
from duckapp.project.backend.app.core import db
from duckapp.project.backend.app.routers.auth import get_current_user
from fastapi.middleware.cors import CORSMiddleware

from duckapp.project.backend.app.routers import auth

app = FastAPI(title="DuckApp Messenger")

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

@app.on_event("startup")
def on_startup():
    db.init_db()

@app.get("/api/users/me")
async def read_me(user=Depends(get_current_user)):
    return user