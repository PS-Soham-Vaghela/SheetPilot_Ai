"""
auth.py — JWT-based authentication for SheetPilot AI web dashboard.

Single-user model: one account per local instance.
Tokens expire after 30 days (long-lived for local dev convenience).
"""

import os
import sqlite3
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "sheetpilot-dev-secret-change-in-production")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 30

DB_PATH = Path(__file__).parent.parent / "sheetpilot_history.db"
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer  = HTTPBearer(auto_error=False)


# ── DB helpers ─────────────────────────────────────────────────────────────────
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def init_users_table() -> None:
    """Create the users table if it doesn't exist. Called on startup."""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                email        TEXT    NOT NULL UNIQUE,
                password_hash TEXT   NOT NULL,
                created_at   TEXT    NOT NULL,
                last_login   TEXT
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    logger.info("Users table ready.")


# ── Password helpers ───────────────────────────────────────────────────────────
def _hash_password(password: str) -> str:
    return _pwd_ctx.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd_ctx.verify(plain, hashed)


# ── JWT helpers ────────────────────────────────────────────────────────────────
def _create_token(user_id: int, email: str) -> str:
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
    with _conn() as c:
        existing = c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        ts = datetime.now(timezone.utc).isoformat()
        cur = c.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?,?,?)",
            (email, _hash_password(password), ts),
        )
        user_id = cur.lastrowid
    token = _create_token(user_id, email)
    return {"id": user_id, "email": email, "created_at": ts, "token": token}


def login_user(email: str, password: str) -> dict:
    """Verify credentials. Returns user dict + token."""
    email = email.strip().lower()
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not row or not _verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    ts = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute("UPDATE users SET last_login=? WHERE id=?", (ts, row["id"]))
    token = _create_token(row["id"], email)
    return {
        "id": row["id"], "email": row["email"],
        "created_at": row["created_at"], "last_login": ts, "token": token,
    }


def get_user_by_id(user_id: int) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT id,email,created_at,last_login FROM users WHERE id=?",
                        (user_id,)).fetchone()
    return dict(row) if row else None


# ── FastAPI dependency ─────────────────────────────────────────────────────────
def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """FastAPI dependency — injects current user or raises 401."""
    if not creds:
        raise HTTPException(status_code=401, detail="Authentication required.")
    payload = _decode_token(creds.credentials)
    user_id = int(payload.get("sub", 0))
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
        return get_user_by_id(int(payload.get("sub", 0)))
    except Exception:
        return None
