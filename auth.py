"""Auth — PBKDF2 password hashing + bearer tokens."""
import hashlib
import secrets

from fastapi import Depends, HTTPException, Request

import db

_ITER = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITER)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITER)
    return secrets.compare_digest(dk.hex(), expected)


def create_token(user_id: int) -> str:
    token = secrets.token_hex(32)
    db.ex("INSERT INTO tokens(token, user_id) VALUES(?, ?)", (token, user_id))
    return token


def current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not signed in")
    token = auth[7:].strip()
    row = db.one(
        """SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id
           WHERE t.token = ?""",
        (token,),
    )
    if not row:
        raise HTTPException(401, "Session expired, sign in again")
    return row


def require_user(user: dict = Depends(current_user)) -> dict:
    return user
