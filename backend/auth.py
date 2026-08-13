"""
auth.py — JWT-based authentication for SheetPilot AI web dashboard.

Single-user model: one account per local instance.
Tokens expire after 30 days (long-lived for local dev convenience).
Uses MongoDB Atlas for user storage.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.db.mongodb import get_db

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "sheetpilot-dev-secret-change-in-production")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 30

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer  = HTTPBearer(auto_error=False)


# ── DB helpers ─────────────────────────────────────────────────────────────────
def _users_col():
    """Return the users collection."""
    return get_db().users


def init_users_collection() -> None:
    """Create indexes on the users collection. Called on startup."""
    try:
        _users_col().create_index("email", unique=True, name="idx_users_email")
        logger.info("Users collection ready.")
    except Exception as e:
        logger.error("Could not initialize users collection index: %s", e)


# ── Password helpers ───────────────────────────────────────────────────────────
def _hash_password(password: str) -> str:
    return _pwd_ctx.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd_ctx.verify(plain, hashed)


# ── JWT helpers ────────────────────────────────────────────────────────────────
def _create_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
        )


# ── Auth operations ────────────────────────────────────────────────────────────
def register_user(email: str, password: str) -> dict:
    """Register a new user. Returns user dict + token."""
    email = email.strip().lower()
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    col = _users_col()
    existing = col.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    ts = datetime.now(timezone.utc).isoformat()
    doc = {
        "email": email,
        "password_hash": _hash_password(password),
        "created_at": ts,
        "last_login": None,
    }
    result = col.insert_one(doc)
    user_id = str(result.inserted_id)

    token = _create_token(user_id, email)
    return {"id": user_id, "email": email, "created_at": ts, "token": token}


def login_user(email: str, password: str) -> dict:
    """Verify credentials. Returns user dict + token."""
    email = email.strip().lower()
    col = _users_col()

    user = col.find_one({"email": email})
    if not user or not _verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    ts = datetime.now(timezone.utc).isoformat()
    col.update_one({"_id": user["_id"]}, {"$set": {"last_login": ts}})

    user_id = str(user["_id"])
    token = _create_token(user_id, email)
    return {
        "id": user_id, "email": user["email"],
        "created_at": user["created_at"], "last_login": ts, "token": token,
    }


def get_user_by_id(user_id) -> Optional[dict]:
    """Fetch user by ObjectId string. Returns None if not found."""
    try:
        oid = ObjectId(str(user_id))
    except Exception:
        return None
    doc = _users_col().find_one({"_id": oid})
    if not doc:
        return None
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "created_at": doc.get("created_at"),
        "last_login": doc.get("last_login"),
    }


# ── FastAPI dependency ─────────────────────────────────────────────────────────
def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """FastAPI dependency — injects current user or raises 401."""
    if not creds:
        raise HTTPException(status_code=401, detail="Authentication required.")
    payload = _decode_token(creds.credentials)
    user_id = payload.get("sub", "")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def get_optional_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[dict]:
    """Like get_current_user but returns None instead of raising (for optional auth)."""
    if not creds:
        return None
    try:
        payload = _decode_token(creds.credentials)
        return get_user_by_id(payload.get("sub", ""))
    except Exception:
        return None
