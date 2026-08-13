"""
orchestrator.py — RAG → LLM → MCP, latency-optimised.

Key change: schema read + RAG indexing now run concurrently via ThreadPoolExecutor
so the ~1-2s embedding cost overlaps with the openpyxl file read.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from backend.mcp.agent_client import AgentMCPClient
from backend.rag import retriever as rag
from backend.llm import local_model as llm
from backend.llm.prompt_templates import build_user_message
from backend.models.schemas import (
    StagedMapping,
    FieldMapping,
    ApprovedMapping,
    CommitResponse,
    RetrievedPassage,
)

logger = logging.getLogger(__name__)
_mcp = AgentMCPClient()



def validate_mapping(field: str, value: str) -> str | None:
    """Validate value formats and return error message if invalid, or None."""
    if not value:
        return None
    f_lower = field.lower().replace(" ", "_").replace("-", "_")
    val_strip = value.strip()
    
    NON_URL_KEYWORDS = {"name", "title", "desc", "description", "theme", "category", "type", "summary", "topic"}
    
    # Email validation
    if "email" in f_lower and not any(k in f_lower for k in ["name", "title", "desc", "type"]):
        if "@" not in val_strip or "." not in val_strip.split("@")[-1]:
            return "Must be a valid email format containing '@' and a domain name (e.g. name@domain.com)."
    
    # URL validation — MUST NOT match name/title/description/theme fields like website_name
    is_url_field = any(x in f_lower for x in ["url", "website", "link"]) and not any(k in f_lower for k in NON_URL_KEYWORDS)
    if is_url_field:
        if not val_strip.startswith(("http://", "https://")) and "." not in val_strip:
            return "Must be a valid URL format (e.g. https://example.com)."
            
    # Numeric / Phone validation
    is_numeric_field = any(x in f_lower for x in ["phone", "price", "count", "cost", "amount"]) or f_lower.endswith("_num") or f_lower == "num"
    if is_numeric_field and not any(k in f_lower for k in ["name", "title", "desc", "theme"]):
        if not any(char.isdigit() for char in val_strip):
            return "Must contain at least one numerical digit."
    
    return None


def find_best_column_match(key: str, columns: list[str]) -> str | None:
    """Safely match LLM field names to Excel schema columns avoiding crude substring clashes."""
    if not key or not columns:
        return None
    key_clean = key.lower().strip().replace(" ", "_").replace("-", "_")
    casing_map = {col.lower().strip().replace(" ", "_").replace("-", "_"): col for col in columns}
    
    # 1. Exact match (case/space/underscore insensitive)
    if key_clean in casing_map:
        return casing_map[key_clean]
        
    # 2. Token overlap similarity
    key_words = set(key_clean.split("_"))
    best_match = None
    best_score = -1.0
    
    for col in columns:
        col_clean = col.lower().strip().replace(" ", "_").replace("-", "_")
        col_words = set(col_clean.split("_"))
        
        intersection = key_words.intersection(col_words)
        if not intersection:
            continue
            
        union = key_words.union(col_words)
        score = len(intersection) / len(union)
        
        # Give higher weight if key is a specific token inside col
        if key_clean in col_words:
            score += 0.5
            
        if score > best_score:
            best_score = score
            best_match = col
            
    if best_match and best_score >= 0.3:
        return best_match
        
    return None


def handle_page_load(
    page_text: str,
    page_url: str,
    workbook_path: str,
    active_row: int,
    worksheet_name: str | None = None,
) -> StagedMapping:
    logger.info("handle_page_load url=%s row=%d text_len=%d",
                page_url, active_row, len(page_text))

    with ThreadPoolExecutor(max_workers=2) as pool:
        schema_future = pool.submit(
            _mcp.read_schema, workbook_path=workbook_path,
            active_row=active_row, worksheet_name=worksheet_name
        )
        rag_future = pool.submit(rag.index_page, page_text=page_text, page_url=page_url)
        schema   = schema_future.result()
        n_chunks = rag_future.result()

    if "error" in schema:
        raise RuntimeError(f"read_schema failed: {schema['error']}")
    logger.info("Schema columns: %s | Indexed %d chunks", schema.get("columns"), n_chunks)

    # ── Missing fields ────────────────────────────────────────────────────────
    missing_result = _mcp.get_missing_fields(workbook_path=workbook_path, row=active_row,
                                              worksheet_name=worksheet_name)
    if "error" in missing_result:
        raise RuntimeError(f"get_missing_fields failed: {missing_result['error']}")

    missing_fields: list[str] = missing_result.get("missing_fields", [])
    logger.info("Missing: %s", missing_fields)

    if not missing_fields:
        _mcp.propose_mapping(row=active_row, mappings=[], missing_fields=[])
        return StagedMapping(
            row=active_row, mappings=[], missing_fields=[],
            all_columns=schema.get("columns", []),
            staged_at=datetime.now(timezone.utc).isoformat(),
        )

    # ── RAG search ────────────────────────────────────────────────────────────
    FIELD_SEMANTIC = {
        "website_name":  "company name brand organisation title",
        "website_url":   "website URL link https www address homepage",
        "company_name":  "company name brand organisation",
        "name":          "name title person company",
        "url":           "URL link website https www",
        "email":         "email contact address",
        "phone":         "phone number contact telephone",
        "address":       "address location city street",
        "title":         "title name heading",
        "price":         "price cost amount fee",
        "date":          "date time year month",
        "website_theme": (
            "company does mission vision about empowers enables provides offers "
            "industry sector technology platform solutions services expertise "
            "what we do our products our services overview"
        ),
        "description": (
            "about overview mission vision empowers enables provides offers "
            "company does solutions services expertise platform"
        ),
        "category":     "industry sector type category market niche domain segment",
        "industry":     "industry sector market domain segment vertical business",
        "summary":      "about overview mission what we do description",
        "topic":        "topic focus subject area about overview industry",
        "theme":        (
            "company does mission vision about empowers enables provides industry "
            "sector technology solutions services expertise overview"
        ),
        "tags":         "keywords topic industry focus area category",
        "keywords":     "topic focus industry category about overview",
    }

    from backend.llm.prompt_templates import _is_inference_field

    concrete_fields = [f for f in missing_fields if not _is_inference_field(f)]
    infer_fields    = [f for f in missing_fields if     _is_inference_field(f)]

    def _build_query(fields: list[str]) -> str:
        parts = []
        for f in fields:
            key = f.lower().replace(" ", "_").replace("-", "_")
            parts.append(FIELD_SEMANTIC.get(key, f.replace("_", " ").replace("-", " ")))
        return " ".join(parts)

    seen_texts: set[str] = set()
    passages: list = []

    if concrete_fields:
        q = _build_query(concrete_fields)
        for p in rag.search(query=q, page_url=page_url, k=4):
            if p.text not in seen_texts:
                seen_texts.add(p.text)
                passages.append(p)

    if infer_fields:
        q = _build_query(infer_fields)
        for p in rag.search(query=q, page_url=page_url, k=7):
            if p.text not in seen_texts:
                seen_texts.add(p.text)
                passages.append(p)

    if not passages:
        passages = rag.search(query=_build_query(missing_fields), page_url=page_url, k=5)

    logger.info(
        "RAG passages=%d (concrete=%d infer=%d) top_score=%.3f",
        len(passages), len(concrete_fields), len(infer_fields),
        passages[0].score if passages else 0.0,
    )

    # ── LLM ──────────────────────────────────────────────────────────────────
    user_message = build_user_message(
        excel_schema=schema,
        retrieved_passages=passages,
        active_row=active_row,
        missing_fields=missing_fields,
        page_url=page_url,
    )
    llm_output = llm.run(user_message=user_message, active_row=active_row)
    
    # ── Agentic Self-Correction Loop ─────────────────────────────────────────
    # Validate value formats and query the LLM again if validation fails.

    failures = []
    for m in llm_output.mappings:
        err = validate_mapping(m.field, m.value)
        if err:
            failures.append((m.field, m.value, err))
            
    if failures:
        logger.info("Validation failed: %s. Initiating self-correction...", failures)
        correction_msg = (
            f"The previous extraction contained values that failed basic format validation:\n\n"
        )
        for field, val, err in failures:
            correction_msg += f"- Field '{field}' had value '{val}': {err}\n"
        correction_msg += (
            "\nPlease review the retrieved passages again and correct the formatting. "
            "Return the complete corrected output JSON matching the original schema."
        )
        try:
            # Query LLM again with self-correction prompt
            corrected_output = llm.run(user_message=correction_msg, active_row=active_row)
            # Re-validate corrected mappings
            still_failing = []
            for m in corrected_output.mappings:
                err = validate_mapping(m.field, m.value)
                if err:
                    still_failing.append(m.field)
            if not still_failing:
                logger.info("Self-correction succeeded!")
                llm_output = corrected_output
            else:
                logger.warning("Self-correction partially failed on fields: %s", still_failing)
                # Still use it as fallback, or merge valid ones
                llm_output = corrected_output
        except Exception as e:
            logger.exception("Error during LLM self-correction loop")

    # Restore case-sensitivity and do fuzzy matching of field names from Excel schema
    columns = schema.get("columns", [])
    
    # Correct mappings
    for m in llm_output.mappings:
        matched = find_best_column_match(m.field, columns)
        if matched:
            m.field = matched
            
    # Correct missing_fields
    corrected_missing = []
    for f in llm_output.missing_fields:
        matched = find_best_column_match(f, columns)
        if matched:
            corrected_missing.append(matched)
        else:
            corrected_missing.append(f)
    llm_output.missing_fields = list(set(corrected_missing))

    logger.info("LLM: %d mappings, %d missing",
                len(llm_output.mappings), len(llm_output.missing_fields))

    # ── URL post-processing: fix internal sub-page links ─────────────────────
    # If the LLM extracted an internal sub-path URL for a url/website field,
    # replace it with the canonical page URL (origin + path of current page).
    if page_url:
        from urllib.parse import urlparse
        parsed_page = urlparse(page_url)
        page_origin = f"{parsed_page.scheme}://{parsed_page.netloc}"
        fixed_mappings = []
        NON_URL_KEYWORDS = {"name", "title", "desc", "description", "theme", "category", "type", "summary", "topic"}
        for m in llm_output.mappings:
            field_key = m.field.lower().replace(" ", "_").replace("-", "_")
            is_url_field = any(x in field_key for x in ["url", "website", "link"]) and not any(k in field_key for k in NON_URL_KEYWORDS)
            if is_url_field and m.value:
                extracted = m.value.strip()
                parsed_val = urlparse(extracted)
                # If extracted value has the same domain but is a sub-path (like /news/ or /blog/),
                # or is a relative path, use the full canonical page_url instead
                same_host = parsed_val.netloc == parsed_page.netloc
                is_subpath = same_host and len(parsed_val.path.strip("/")) > len(parsed_page.path.strip("/"))
                is_relative = not parsed_val.scheme and extracted.startswith("/")
                if is_subpath or is_relative:
                    logger.info(
                        "URL post-fix: field=%s extracted=%r → using page_url=%r",
                        m.field, extracted, page_url,
                    )
                    from backend.models.schemas import FieldMapping
                    m = FieldMapping(
                        field=m.field,
                        value=page_url,
                        confidence=m.confidence,
                        source=m.source,
                    )
            fixed_mappings.append(m)
        llm_output.mappings = fixed_mappings

    # ── Stage ─────────────────────────────────────────────────────────────────
    _mcp.propose_mapping(
        row=active_row,
        mappings=[{"field":m.field,"value":m.value,"confidence":m.confidence,"source":m.source}
                  for m in llm_output.mappings],
        missing_fields=llm_output.missing_fields,
    )

    return StagedMapping(
        row=active_row,
        mappings=llm_output.mappings,
        missing_fields=llm_output.missing_fields,
        all_columns=schema.get("columns", []),
        staged_at=datetime.now(timezone.utc).isoformat(),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 of the E2E flow — called after user clicks "Approve and sync"
# ─────────────────────────────────────────────────────────────────────────────
def handle_user_approval(
    workbook_path: str,
    row: int,
    approved_mappings: list[ApprovedMapping],
    page_url: str = "",
) -> CommitResponse:
    """
    Called only after the user explicitly approves (or edits + approves) the
    proposed mappings in the side panel.

    Args:
        workbook_path:     Path to the .xlsx file.
        row:               Row number the user approved.
        approved_mappings: List of ApprovedMapping objects (field + value,
                           with 'edited' flag if user changed the value).

    Returns:
        CommitResponse with success status and number of rows written.
    """
    logger.info(
        "handle_user_approval: workbook=%s row=%d fields=%d",
        workbook_path, row, len(approved_mappings),
    )

    if not approved_mappings:
        return CommitResponse(success=True, rows_written=0)

    # Build the payload for MCP commit_to_excel
    commit_payload = [
        {"field": m.field, "value": m.value}
        for m in approved_mappings
    ]

    result = _mcp.commit_to_excel(
        workbook_path=workbook_path,
        row=row,
        approved_mappings=commit_payload,
        page_url=page_url,
    )

    if "error" in result:
        logger.error("commit_to_excel failed: %s", result["error"])
        return CommitResponse(success=False, rows_written=0, error=result["error"])

    logger.info(
        "Committed %d fields to row %d of %s",
        result.get("fields_written", 0), row, workbook_path,
    )

    return CommitResponse(
        success=True,
        rows_written=result.get("rows_written", 1),
    )
