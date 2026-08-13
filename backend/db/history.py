"""
history.py — MongoDB-backed sync history, undo, and dashboard analytics.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId

from backend.db.mongodb import get_db

logger = logging.getLogger(__name__)


def _col():
    """Return the sync_history collection."""
    return get_db().sync_history


def init_db() -> None:
    """Create indexes. Safe to call on every startup."""
    from backend.db.mongodb import init_indexes
    init_indexes()


def log_commit(
    workbook_path: str,
    worksheet: str,
    row: int,
    page_url: str,
    written: list[dict],
    approved_mappings: list,
) -> str:
    old_map = {}
    for w in written:
        if isinstance(w, dict):
            f_name = w.get("field", "")
            if f_name:
                old_map[f_name] = w.get("old_value", "")

    fields = []
    for m in approved_mappings:
        f_name = m.get("field", "") if isinstance(m, dict) else getattr(m, "field", "")
        f_val  = m.get("value", "") if isinstance(m, dict) else getattr(m, "value", "")
        fields.append({
            "field": f_name,
            "value": f_val,
            "old_value": old_map.get(f_name, "")
        })

    ts = datetime.now(timezone.utc).isoformat()
    doc = {
        "ts": ts,
        "workbook_path": workbook_path,
        "worksheet": worksheet,
        "row": row,
        "page_url": page_url,
        "fields_json": json.dumps(fields),
        "undone": False,
    }
    result = _col().insert_one(doc)
    return str(result.inserted_id)


def get_history(workbook_path: Optional[str] = None, limit: int = 50) -> list[dict]:
    query = {}
    if workbook_path:
        query["workbook_path"] = workbook_path
    cursor = _col().find(query).sort("_id", -1).limit(limit)
    return [_serialize(doc) for doc in cursor]


def search_history(
    query: str = "",
    workbook_path: str = "",
    page_url: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """Advanced filtered history search for the dashboard History page."""
    mongo_filter = {}
    conditions = []

    if workbook_path:
        conditions.append({"workbook_path": {"$regex": workbook_path, "$options": "i"}})
    if page_url:
        conditions.append({"page_url": {"$regex": page_url, "$options": "i"}})
    if query:
        conditions.append({
            "$or": [
                {"workbook_path": {"$regex": query, "$options": "i"}},
                {"page_url": {"$regex": query, "$options": "i"}},
                {"fields_json": {"$regex": query, "$options": "i"}},
            ]
        })
    if date_from:
        conditions.append({"ts": {"$gte": date_from}})
    if date_to:
        conditions.append({"ts": {"$lte": date_to + "T23:59:59"}})

    if conditions:
        mongo_filter = {"$and": conditions} if len(conditions) > 1 else conditions[0]

    total = _col().count_documents(mongo_filter)
    cursor = _col().find(mongo_filter).sort("_id", -1).skip(offset).limit(limit)

    return {"total": total, "records": [_serialize(doc) for doc in cursor]}


def get_last_commit(workbook_path: str) -> Optional[dict]:
    doc = _col().find_one(
        {"workbook_path": workbook_path, "undone": False},
        sort=[("_id", -1)],
    )
    return _serialize(doc) if doc else None


def mark_undone(record_id) -> None:
    """Mark a history record as undone. Accepts str or int id."""
    _col().update_one(
        {"_id": ObjectId(str(record_id))},
        {"$set": {"undone": True}},
    )


# ── Dashboard analytics ────────────────────────────────────────────────────────

def get_stats() -> dict:
    """Aggregate stats for the dashboard overview cards."""
    col = _col()

    total_syncs = col.count_documents({"undone": False})

    # Count total fields across all active syncs
    pipeline_fields = [
        {"$match": {"undone": False}},
        {"$project": {"fields_json": 1}},
    ]
    fields_count = 0
    for doc in col.aggregate(pipeline_fields):
        try:
            fields_count += len(json.loads(doc["fields_json"]))
        except (json.JSONDecodeError, KeyError):
            pass

    # Unique workbooks
    unique_workbooks = len(col.distinct("workbook_path", {"undone": False}))

    # Unique pages
    unique_pages = len(col.distinct("page_url", {
        "undone": False,
        "page_url": {"$nin": [None, ""]},
    }))

    # Last sync timestamp
    last_doc = col.find_one({"undone": False}, sort=[("_id", -1)])

    return {
        "total_syncs": total_syncs,
        "total_fields_written": fields_count,
        "unique_workbooks": unique_workbooks,
        "unique_pages_analyzed": unique_pages,
        "last_sync_at": last_doc["ts"] if last_doc else None,
    }


def get_activity_by_day(days: int = 30) -> list[dict]:
    """Returns syncs-per-day for the last N days — used for the activity chart."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"ts": {"$gte": cutoff}}},
        {"$addFields": {"day": {"$substr": ["$ts", 0, 10]}}},
        {"$group": {
            "_id": "$day",
            "syncs": {"$sum": 1},
            "active_syncs": {
                "$sum": {"$cond": [{"$eq": ["$undone", False]}, 1, 0]}
            },
        }},
        {"$sort": {"_id": 1}},
        {"$project": {"_id": 0, "day": "$_id", "syncs": 1, "active_syncs": 1}},
    ]
    return list(_col().aggregate(pipeline))


def get_workbooks_summary() -> list[dict]:
    """Returns per-workbook stats for the Workbooks page."""
    pipeline = [
        {"$group": {
            "_id": "$workbook_path",
            "total_syncs": {"$sum": 1},
            "last_synced_at": {"$max": "$ts"},
            "sheet_count": {"$addToSet": "$worksheet"},
            "active_syncs": {
                "$sum": {"$cond": [{"$eq": ["$undone", False]}, 1, 0]}
            },
            "fields_docs": {
                "$push": {
                    "$cond": [
                        {"$eq": ["$undone", False]},
                        "$fields_json",
                        None,
                    ]
                }
            },
        }},
        {"$sort": {"last_synced_at": -1}},
    ]
    result = []
    for doc in _col().aggregate(pipeline):
        total_fields = 0
        for fj in doc.get("fields_docs", []):
            if fj is not None:
                try:
                    total_fields += len(json.loads(fj))
                except (json.JSONDecodeError, TypeError):
                    pass
        result.append({
            "workbook_path": doc["_id"],
            "total_syncs": doc["total_syncs"],
            "last_synced_at": doc["last_synced_at"],
            "sheet_count": len(doc["sheet_count"]),
            "active_syncs": doc["active_syncs"],
            "total_fields_written": total_fields,
        })
    return result


def get_recent_syncs(limit: int = 10) -> list[dict]:
    """Returns the most recent N syncs for the dashboard recent-activity panel."""
    cursor = _col().find().sort("_id", -1).limit(limit)
    return [_serialize(doc) for doc in cursor]


# ── Serialization helper ──────────────────────────────────────────────────────

def _serialize(doc: dict) -> dict:
    """Convert a MongoDB document to a JSON-friendly dict matching the old SQLite schema."""
    if doc is None:
        return doc
    return {
        "id": str(doc["_id"]),
        "ts": doc.get("ts"),
        "workbook_path": doc.get("workbook_path"),
        "worksheet": doc.get("worksheet"),
        "row": doc.get("row"),
        "page_url": doc.get("page_url"),
        "fields_json": doc.get("fields_json"),
        "undone": 1 if doc.get("undone") else 0,  # keep API compat (int 0/1)
    }
