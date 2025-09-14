from fastapi import FastAPI, Depends
from DataBases import db_manager as db
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, chats, profile
from routers.auth import get_current_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield

app = FastAPI(title="DuckApp Messenger", lifespan=lifespan)

# Разрешаем фронту коннектиться
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем маршруты авторизации
app.include_router(auth.router, prefix="/api/auth")
app.include_router(chats.router, prefix="/api")
app.include_router(profile.router, prefix="/api")

from fastapi.staticfiles import StaticFiles

app.mount("/assets", StaticFiles(directory=r"project/frontend/html/assets"), name="assets")

@app.get("/api/users/me")
async def read_me(user=Depends(get_current_user)):
    return user

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("startApp:app", host="127.0.0.1", port=8000, reload=True)