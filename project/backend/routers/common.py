from fastapi import HTTPException


def extract_user_id(current_user: dict) -> int:
    user_id = current_user.get("id") or current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User is not authenticated")
    return int(user_id)
