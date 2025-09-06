# main.py
from fastapi import FastAPI, Depends
from backend import auth, db
from backend.auth import get_current_user
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Messenger Auth with MySQL (no ORM)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth")

@app.on_event("startup")
def on_startup():
    db.init_db()

@app.get("/api/users/me")
async def read_me(user=Depends(get_current_user)):
    return user