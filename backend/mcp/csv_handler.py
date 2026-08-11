"""
csv_handler.py — read/write support for .csv files.

Mirrors the same interface as excel_server tool functions so the
orchestrator and MCP client can call them transparently.
"""

import csv
import logging
import os
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def read_schema_csv(file_path: str, active_row: int) -> dict:
    path = Path(file_path)
    if not path.exists():
        return {"error": f"CSV not found: {file_path}"}
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            rows    = list(reader)
        total = len(rows) + 1   # +1 for header row
        # active_row is 1-indexed; row 1 = header, row 2 = first data row
        data_idx = active_row - 2
        row_data = {}
        if 0 <= data_idx < len(rows):
            row_data = dict(rows[data_idx])
        return {
            "workbook_path":    file_path,
            "worksheet_name":   path.stem,
            "sheet_names":      [path.stem],
            "columns":          list(headers),
            "active_row":       active_row,
            "total_rows":       total,
            "current_row_data": row_data,
        }
    except Exception as exc:
        return {"error": str(exc)}


def get_missing_fields_csv(file_path: str, row: int) -> dict:
    schema = read_schema_csv(file_path, row)
    if "error" in schema:
        return schema
    missing = [k for k, v in schema["current_row_data"].items()
               if not v or str(v).strip() == ""]
    return {"row": row, "missing_fields": missing, "total_missing": len(missing)}


def commit_to_csv(file_path: str, row: int, approved_mappings: list[dict]) -> dict:
    """
    Write approved mappings into a CSV. Uses temp-file + atomic replace
    so partial writes are safe.
    """
    path = Path(file_path)
    if not path.exists():
        return {"error": f"CSV not found: {file_path}"}

    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader   = csv.DictReader(f)
            headers  = list(reader.fieldnames or [])
            all_rows = list(reader)

        # active_row is 1-indexed, row 1 = header → data index = row - 2
        data_idx = row - 2
        # Expand if needed
        while len(all_rows) <= data_idx:
            all_rows.append({h: "" for h in headers})

        # Case-insensitive field matching (same as excel_server)
        header_lower = {h.lower().strip(): h for h in headers}
        written, skipped = [], []

        for m in approved_mappings:
            field = m["field"]
            value = m["value"]
            if field in headers:
                canonical = field
            elif field.lower().strip() in header_lower:
                canonical = header_lower[field.lower().strip()]
            else:
                skipped.append({"field": field, "reason": "column not found"})
                continue
            old = all_rows[data_idx].get(canonical, "")
            all_rows[data_idx][canonical] = value
            written.append({"field": canonical, "value": value,
                             "overwrote": bool(old and old.strip())})

        # Write to temp then atomic replace
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                          dir=path.parent, newline="", encoding="utf-8-sig")
        writer = csv.DictWriter(tmp, fieldnames=headers)
        writer.writeheader()
        writer.writerows(all_rows)
        tmp.close()
        os.replace(tmp.name, file_path)

        return {
            "status":         "committed",
            "rows_written":   1,
            "fields_written": len(written),
            "written":        written,
            "skipped":        skipped,
        }
    except Exception as exc:
        return {"error": str(exc)}
