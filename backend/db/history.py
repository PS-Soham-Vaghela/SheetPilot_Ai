"""
history.py — SQLite-backed sync history, undo, and dashboard analytics.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "sheetpilot_history.db"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    """Create all tables. Safe to call on every startup."""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS sync_history (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                ts            TEXT    NOT NULL,
                workbook_path TEXT    NOT NULL,
                worksheet     TEXT,
                row           INTEGER NOT NULL,
                page_url      TEXT,
                fields_json   TEXT    NOT NULL,
                undone        INTEGER NOT NULL DEFAULT 0
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_wb ON sync_history(workbook_path, row)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_ts ON sync_history(ts)")


def log_commit(
    workbook_path: str,
    worksheet: str,
    row: int,
    page_url: str,
    written: list[dict],
    approved_mappings: list[dict],
) -> int:
    old_map = {w["field"]: w.get("old_value", "") for w in written}
    fields = [
        {"field": m["field"], "value": m["value"], "old_value": old_map.get(m["field"], "")}
        for m in approved_mappings
    ]
    ts = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO sync_history (ts,workbook_path,worksheet,row,page_url,fields_json) VALUES (?,?,?,?,?,?)",
            (ts, workbook_path, worksheet, row, page_url, json.dumps(fields)),
        )
        return cur.lastrowid


def get_history(workbook_path: Optional[str] = None, limit: int = 50) -> list[dict]:
    with _conn() as c:
        if workbook_path:
            rows = c.execute(
                "SELECT * FROM sync_history WHERE workbook_path=? ORDER BY id DESC LIMIT ?",
                (workbook_path, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM sync_history ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
    return [dict(r) for r in rows]


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
    clauses = []
    params: list = []

    if workbook_path:
        clauses.append("workbook_path LIKE ?")
        params.append(f"%{workbook_path}%")
    if page_url:
        clauses.append("page_url LIKE ?")
        params.append(f"%{page_url}%")
    if query:
        clauses.append("(workbook_path LIKE ? OR page_url LIKE ? OR fields_json LIKE ?)")
        params += [f"%{query}%", f"%{query}%", f"%{query}%"]
    if date_from:
        clauses.append("ts >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("ts <= ?")
        params.append(date_to + "T23:59:59")

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with _conn() as c:
        total = c.execute(
            f"SELECT COUNT(*) FROM sync_history {where}", params
        ).fetchone()[0]
        rows = c.execute(
            f"SELECT * FROM sync_history {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

    return {"total": total, "records": [dict(r) for r in rows]}


def get_last_commit(workbook_path: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM sync_history WHERE workbook_path=? AND undone=0 ORDER BY id DESC LIMIT 1",
            (workbook_path,),
        ).fetchone()
    return dict(row) if row else None


def mark_undone(record_id: int) -> None:
    with _conn() as c:
        c.execute("UPDATE sync_history SET undone=1 WHERE id=?", (record_id,))


# ── Dashboard analytics ────────────────────────────────────────────────────────

def get_stats() -> dict:
    """Aggregate stats for the dashboard overview cards."""
    with _conn() as c:
        total_syncs = c.execute(
            "SELECT COUNT(*) FROM sync_history WHERE undone=0"
        ).fetchone()[0]

        total_fields = c.execute(
            "SELECT fields_json FROM sync_history WHERE undone=0"
        ).fetchall()
        fields_count = sum(
            len(json.loads(r["fields_json"])) for r in total_fields
        )

        unique_workbooks = c.execute(
            "SELECT COUNT(DISTINCT workbook_path) FROM sync_history WHERE undone=0"
        ).fetchone()[0]

        unique_pages = c.execute(
            "SELECT COUNT(DISTINCT page_url) FROM sync_history WHERE undone=0 AND page_url IS NOT NULL AND page_url != ''"
        ).fetchone()[0]

        last_sync = c.execute(
            "SELECT ts FROM sync_history WHERE undone=0 ORDER BY id DESC LIMIT 1"
        ).fetchone()

    return {
        "total_syncs": total_syncs,
        "total_fields_written": fields_count,
        "unique_workbooks": unique_workbooks,
        "unique_pages_analyzed": unique_pages,
        "last_sync_at": last_sync["ts"] if last_sync else None,
    }


def get_activity_by_day(days: int = 30) -> list[dict]:
    """Returns syncs-per-day for the last N days — used for the activity chart."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with _conn() as c:
        rows = c.execute(
            """
            SELECT substr(ts,1,10) as day, COUNT(*) as syncs,
                   SUM(CASE WHEN undone=0 THEN 1 ELSE 0 END) as active_syncs
            FROM sync_history
            WHERE ts >= ?
            GROUP BY day
            ORDER BY day ASC
            """,
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_workbooks_summary() -> list[dict]:
    """Returns per-workbook stats for the Workbooks page."""
    with _conn() as c:
        rows = c.execute(
            """
            SELECT
                workbook_path,
                COUNT(*)           AS total_syncs,
                MAX(ts)            AS last_synced_at,
                COUNT(DISTINCT worksheet) AS sheet_count,
                SUM(CASE WHEN undone=0 THEN 1 ELSE 0 END) AS active_syncs
            FROM sync_history
            GROUP BY workbook_path
            ORDER BY last_synced_at DESC
            """
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        # Compute total fields written for this workbook
        with _conn() as c2:
            field_rows = c2.execute(
                "SELECT fields_json FROM sync_history WHERE workbook_path=? AND undone=0",
                (d["workbook_path"],),
            ).fetchall()
        d["total_fields_written"] = sum(len(json.loads(f["fields_json"])) for f in field_rows)
        result.append(d)
    return result


def get_recent_syncs(limit: int = 10) -> list[dict]:
    """Returns the most recent N syncs for the dashboard recent-activity panel."""
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM sync_history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
