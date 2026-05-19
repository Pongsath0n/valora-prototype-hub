from fastapi import Header, HTTPException


def get_admin_user(x_admin_user_id: str | None = Header(default=None)) -> str | None:
    if x_admin_user_id is not None and not x_admin_user_id.strip():
        raise HTTPException(status_code=400, detail='Invalid X-Admin-User-Id header')
    return x_admin_user_id
