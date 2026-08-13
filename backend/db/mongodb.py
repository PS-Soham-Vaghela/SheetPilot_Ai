"""
mongodb.py — Centralized MongoDB connection manager for SheetPilot AI.

Uses pymongo (synchronous driver) with built-in connection pooling.
Reads MONGODB_URI from environment (supports MongoDB Atlas connection strings).
"""

import os
import logging
from pymongo import MongoClient
from pymongo.database import Database

logger = logging.getLogger(__name__)

_client: MongoClient | None = None
_db: Database | None = None


def get_db() -> Database:
    """Return the shared MongoDB database instance. Thread-safe via pymongo pooling."""
    global _client, _db
    if _db is not None:
        return _db

    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017").strip()
    db_name = os.getenv("MONGODB_DB_NAME", "sheetpilot").strip()

    # Check for unreplaced placeholder template strings in MONGODB_URI
    if "<username>" in uri or "<password>" in uri or "<cluster>" in uri:
        logger.warning(
            "MONGODB_URI in .env contains placeholders (<username>/<cluster>). "
            "Falling back to local MongoDB (mongodb://localhost:27017). "
            "Please update MONGODB_URI in .env with your actual MongoDB Atlas connection string."
        )
        uri = "mongodb://localhost:27017"

    try:
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        _db = _client[db_name]
        logger.info("MongoDB client initialized -> db=%s", db_name)
        return _db
    except Exception as e:
        logger.error("Failed to initialize MongoDB client with URI '%s': %s", uri, e)
        # Fallback to local
        if uri != "mongodb://localhost:27017":
            logger.info("Attempting fallback to mongodb://localhost:27017...")
            _client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=5000)
            _db = _client[db_name]
            return _db
        raise e


def init_indexes() -> None:
    """Create required indexes. Safe to call on every startup."""
    try:
        db = get_db()

        # ── Users collection ──────────────────────────────────────────────────────
        db.users.create_index("email", unique=True, name="idx_users_email")

        # ── Sync-history collection ───────────────────────────────────────────────
        db.sync_history.create_index(
            [("workbook_path", 1), ("row", 1)], name="idx_wb_row"
        )
        db.sync_history.create_index("ts", name="idx_ts")
        db.sync_history.create_index("workbook_path", name="idx_wb")

        logger.info("MongoDB indexes ensured.")
    except Exception as e:
        logger.error(
            "MongoDB initialization warning: Could not connect to MongoDB or set indexes (%s). "
            "Please check your MONGODB_URI in .env or ensure MongoDB server is running.",
            e,
        )


def close_db() -> None:
    """Close the MongoDB connection (called on shutdown)."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed.")
