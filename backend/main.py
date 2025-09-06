from fastapi import FastAPI, Depends
from app import auth, db
from app.auth import get_current_user

app = FastAPI(title="Messenger Auth with MySQL (no ORM)")

app.include_router(auth.router, prefix="/api/auth")

@app.on_event("startup")
def on_startup():
    db.init_db()

@app.get("/api/users/me")
async def read_me(user=Depends(get_current_user)):
    return user
