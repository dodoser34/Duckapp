from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from DataBases import db_manager as db
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, profile, friends, messages

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield

app = FastAPI(title="DuckApp Messenger", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth.router, prefix="/api/auth")
app.include_router(profile.router, prefix="/api")
app.include_router(friends.router)
app.include_router(messages.router)

app.mount("/assets", StaticFiles(directory=r"project/frontend/html/assets"), name="assets")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("startApp:app", host="127.0.0.1", port=8000, reload=True)
