from fastapi import FastAPI, Depends
from backend import auth, db
from backend.auth import get_current_user
from fastapi.middleware.cors import CORSMiddleware

backend  = FastAPI()

backend.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

backend = FastAPI(title="Messenger Auth with MySQL (no ORM)")

backend.include_router(auth.router, prefix="/api/auth")

@backend.on_event("startup")
def on_startup():
    db.init_db()

@backend.get("/api/users/me")
async def read_me(user=Depends(get_current_user)):
    return user
