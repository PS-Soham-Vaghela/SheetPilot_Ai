"""
MCP Agent Client — used by orchestrator.py to call Excel MCP tools.

Instead of raw stdio transport (which would require a subprocess), this client
talks to the excel_server functions directly via an in-process bridge. This is
the recommended pattern for single-process deployments where the MCP server and
agent run in the same Python process.

For a production multi-process deployment, swap _InProcessBridge for a proper
StdioClientSession pointing at the server subprocess.
"""

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# In-process bridge — calls excel_server functions directly
# ─────────────────────────────────────────────────────────────────────────────
class _InProcessBridge:
    """
    Thin wrapper that imports the excel_server tool implementations and
    calls them directly. This avoids needing a subprocess just to call tools.
    """

    def __init__(self):
        # Lazy import to avoid circular deps at module level
        from backend.mcp import excel_server as _srv
        self._srv = _srv

    def call(self, tool_name: str, **kwargs) -> dict[str, Any]:
        dispatch = {
            "read_schema": self._srv._read_schema,
            "propose_mapping": self._srv._propose_mapping,
            "commit_to_excel": self._srv._commit_to_excel,
            "get_missing_fields": self._srv._get_missing_fields,
        }
        fn = dispatch.get(tool_name)
        if fn is None:
            raise ValueError(f"Unknown MCP tool: {tool_name}")
        logger.debug("MCP call → %s(%s)", tool_name, kwargs)
        result = fn(**kwargs)
        logger.debug("MCP result ← %s", result)
        return result


# ─────────────────────────────────────────────────────────────────────────────
# Public AgentMCPClient
# ─────────────────────────────────────────────────────────────────────────────
class AgentMCPClient:
    """
    The MCP client the orchestrator uses. Exposes one method: `call(tool, **kwargs)`.

    Usage:
        client = AgentMCPClient()
        schema = client.call("read_schema", workbook_path="...", active_row=2)
        missing = client.call("get_missing_fields", workbook_path="...", row=2)
    """

    def __init__(self):
        self._bridge = _InProcessBridge()

    def call(self, tool_name: str, **kwargs) -> dict[str, Any]:
        """
        Synchronous tool call. Auto-routes .csv files to csv_handler,
        .xlsx/.xls to excel_server.
        """
        # Auto-detect CSV vs Excel
        wb = kwargs.get("workbook_path", "")
        if wb and str(wb).lower().endswith(".csv"):
            return self._call_csv(tool_name, **kwargs)
        return self._bridge.call(tool_name, **kwargs)

    def _call_csv(self, tool_name: str, **kwargs) -> dict[str, Any]:
        from backend.mcp.csv_handler import (
            read_schema_csv, get_missing_fields_csv, commit_to_csv
        )
        wb  = kwargs["workbook_path"]
        if tool_name == "read_schema":
            return read_schema_csv(wb, kwargs.get("active_row", 2))
        elif tool_name == "get_missing_fields":
            return get_missing_fields_csv(wb, kwargs.get("row", 2))
        elif tool_name == "commit_to_excel":
            return commit_to_csv(wb, kwargs["row"], kwargs["approved_mappings"], page_url=kwargs.get("page_url", ""))
        elif tool_name == "propose_mapping":
            return {"status": "staged", "row": kwargs.get("row", 2),
                    "field_count": len(kwargs.get("mappings", [])),
                    "missing_count": len(kwargs.get("missing_fields", []))}
        return {"error": f"Unknown CSV tool: {tool_name}"}

    # ── Convenience typed wrappers ────────────────────────────────────────────

    def read_schema(self, workbook_path: str, active_row: int,
                    worksheet_name=None) -> dict:
        kw = {"workbook_path": workbook_path, "active_row": active_row}
        if worksheet_name:
            kw["worksheet_name"] = worksheet_name
        return self.call("read_schema", **kw)

    def propose_mapping(
        self,
        row: int,
        mappings: list[dict],
        missing_fields: list[str] | None = None,
    ) -> dict:
        return self.call(
            "propose_mapping",
            row=row,
            mappings=mappings,
            missing_fields=missing_fields or [],
        )

    def commit_to_excel(
        self,
        workbook_path: str,
        row: int,
        approved_mappings: list[dict],
        page_url: str = "",
    ) -> dict:
        return self.call(
            "commit_to_excel",
            workbook_path=workbook_path,
            row=row,
            approved_mappings=approved_mappings,
            page_url=page_url,
        )

    def get_missing_fields(self, workbook_path: str, row: int,
                           worksheet_name=None) -> dict:
        kw = {"workbook_path": workbook_path, "row": row}
        if worksheet_name:
            kw["worksheet_name"] = worksheet_name
        return self.call("get_missing_fields", **kw)
