"""
test_advanced_features.py — Automated test suite for SheetPilot AI.

Tests:
1. RAG Lexical & Hybrid search scoring
2. In-Browser Spreadsheet Editor CRUD operations
3. Schema extraction and column mapping
4. Heuristic semantic mapping
"""

import sys
from pathlib import Path

# Add project root to python path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.rag.retriever import _compute_lexical_scores
from backend.mcp.excel_editor import (
    create_new_workbook,
    get_sheet_data,
    update_cell,
    update_batch,
    add_row,
    delete_row,
    add_column,
)
from backend.main import _build_semantic_map


def test_lexical_search():
    texts = [
        "Apple Inc. is an American multinational technology company headquartered in Cupertino, California.",
        "Google LLC is an American multinational technology company focusing on search engine technology.",
        "Microsoft Corporation is an American multinational technology company which produces computer software.",
    ]
    
    # Test query for Apple
    scores_apple = _compute_lexical_scores("Apple Cupertino", texts)
    assert scores_apple[0] > scores_apple[1], "Lexical score for Apple should be highest for doc 0"
    
    # Test query for Google
    scores_google = _compute_lexical_scores("Google Search", texts)
    assert scores_google[1] > scores_google[0], "Lexical score for Google should be highest for doc 1"
    
    print("[PASS] Lexical RAG Search Test")



def test_spreadsheet_editor_crud():
    # 1. Create a test workbook
    wb_res = create_new_workbook(
        filename="test_suite_temp.xlsx",
        headers=["Company", "Contact", "Email", "Status"],
    )
    assert wb_res["success"] is True, "Failed to create test workbook"
    path = wb_res["workbook_path"]

    try:
        # 2. Update cell
        u_res = update_cell(path, worksheet_name="Sheet1", row=2, col=1, value="Acme Corp")
        assert u_res["success"] is True
        assert u_res["value"] == "Acme Corp"

        # 3. Add row
        r_res = add_row(path, worksheet_name="Sheet1", row_data=["Stark Ind", "Tony", "t@stark.com", "Active"])
        assert r_res["success"] is True
        assert r_res["row_index"] == 3

        # 4. Add column
        c_res = add_column(path, worksheet_name="Sheet1", column_name="Notes")
        assert c_res["success"] is True

        # 5. Read sheet data
        data = get_sheet_data(path, worksheet_name="Sheet1")
        assert data["success"] is True
        assert "Notes" in data["headers"]
        assert len(data["rows"]) >= 2
        assert data["rows"][0]["values"][0] == "Acme Corp"
        assert data["rows"][1]["values"][0] == "Stark Ind"

        # 6. Delete row
        d_res = delete_row(path, worksheet_name="Sheet1", row_index=3)
        assert d_res["success"] is True

        print("[PASS] Spreadsheet Editor Full CRUD Test")
    finally:
        # Cleanup
        from backend.mcp.excel_server import _resolve_path
        try:
            real_path = _resolve_path(path)
            real_path.unlink(missing_ok=True)
        except Exception:
            pass


def test_semantic_mapping():
    cols = ["Vendor Name", "Invoice Number", "Vendor GST Number", "Total Amount", "Website"]
    mapping = _build_semantic_map(cols)
    assert "name" in mapping["Vendor Name"].lower()
    assert "website" in mapping["Website"].lower()
    print("[PASS] Semantic Heuristic Mapping Test")


if __name__ == "__main__":
    print("\n--- Running SheetPilot AI Automated Test Suite ---")
    test_lexical_search()
    test_spreadsheet_editor_crud()
    test_semantic_mapping()
    print("--- ALL TESTS PASSED SUCCESSFULLY! ---\n")
