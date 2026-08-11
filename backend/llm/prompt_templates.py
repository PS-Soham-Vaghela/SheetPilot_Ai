"""
prompt_templates.py — two-tier prompt for extraction AND inference.

Field types:
  CONCRETE  — name, URL, email, phone, date, price  → extract VERBATIM from text
  CONCEPTUAL — theme, category, industry, description, summary, topic
               → USE LLM INTELLIGENCE to infer the best answer from page context.
               The word "theme" will never appear literally on the page — the LLM
               must read and understand what the site is about, then label it.
"""

import json
from backend.models.schemas import RetrievedPassage

# ── Keywords that mark a field as needing INFERENCE, not verbatim extraction ──
_INFER_KEYWORDS = {
    "theme", "category", "industry", "sector", "type", "topic", "focus",
    "description", "summary", "about", "tags", "keywords", "vertical",
    "niche", "domain", "segment", "market", "product_type", "service_type",
}

def _is_inference_field(field_name: str) -> bool:
    """Return True if this field needs LLM intelligence (inference) rather than verbatim extraction."""
    key = field_name.lower().replace(" ", "_").replace("-", "_")
    return any(kw in key for kw in _INFER_KEYWORDS)


# ── System prompt — allows both extraction AND inference ──────────────────────
SYSTEM_PROMPT = """\
You are a smart data extraction and inference assistant. \
Your job is to fill a JSON object with values taken from or inferred from a webpage.

There are TWO modes depending on the field type:

MODE 1 — EXTRACT (for concrete facts: name, URL, email, phone, address, date, price, person)
  → Find the value exactly as it appears in the text. Do NOT rephrase or invent it.

MODE 2 — INFER (for conceptual/categorical fields marked with [INFER] in the task)
  → Read the page carefully and USE YOUR INTELLIGENCE to determine the best answer.
  → The label will NOT appear verbatim on the page. Synthesise from page content.
  → Example: if a page talks about "chemical safety regulations and compliance data",
    a 'website_theme' answer could be "Chemical Safety & Regulatory Compliance".
  → Give a short, precise label (2-6 words). Do not quote long sentences.

CRITICAL RULES:
1. Return ONLY a JSON object. No markdown. No explanation. Nothing before or after the JSON.
2. Use exactly the field names given — same capitalisation.
3. The key for each mapping item MUST be "field" (not "id", "name", or anything else).
4. confidence: "high" if certain, "medium" if mostly sure, "low" if guessing.
5. source: for EXTRACT fields write a short excerpt from the text; \
for INFER fields write "inferred from page content".
6. If you truly cannot determine a value even by inference, add to "missing_fields".

EXACT OUTPUT FORMAT (copy this structure):
{"row":2,"mappings":[{"field":"company_name","value":"Acme Corp","confidence":"high","source":"Acme Corp is a"},{"field":"website_theme","value":"B2B SaaS / Project Management","confidence":"high","source":"inferred from page content"}],"missing_fields":["phone"]}"""


# ── User message builder ──────────────────────────────────────────────────────
def build_user_message(
    excel_schema: dict,
    retrieved_passages: list[RetrievedPassage],
    active_row: int,
    missing_fields: list[str],
    page_url: str = "",
) -> str:
    columns = excel_schema.get("columns", [])

    # Split fields into extract vs infer for targeted instructions
    extract_fields = [f for f in missing_fields if not _is_inference_field(f)]
    infer_fields   = [f for f in missing_fields if     _is_inference_field(f)]

    def _fmt_fields(fields: list[str], tag: str) -> str:
        return "\n".join(f"  - {f} [{tag}]" for f in fields)

    fields_block_parts = []
    if extract_fields:
        fields_block_parts.append("  # EXTRACT mode — find verbatim in text:")
        fields_block_parts.append(_fmt_fields(extract_fields, "EXTRACT"))
    if infer_fields:
        fields_block_parts.append("  # INFER mode — use intelligence, do not look for literal match:")
        fields_block_parts.append(_fmt_fields(infer_fields, "INFER"))
    fields_block = "\n".join(fields_block_parts) or "  (none)"

    passages_block = "\n\n".join(
        "[Passage " + str(i+1) + "]\n" + p.text[:600].strip()
        for i, p in enumerate(retrieved_passages)
    ) if retrieved_passages else "[No passages retrieved]"

    parts = [
        "TASK: Fill the fields below from the webpage content.",
        "",
    ]

    # Authoritative page context block
    if page_url:
        parts += [
            "AUTHORITATIVE PAGE FACTS (trust these above all else):",
            "  Current page URL: " + page_url,
            "",
        ]

    parts += [
        "Row number: " + str(active_row),
        "Excel columns: " + json.dumps(columns),
        "",
        "FIELDS TO FILL:",
        fields_block,
        "",
        "WEBPAGE CONTENT (read carefully — especially for [INFER] fields):",
        passages_block,
        "",
        "INSTRUCTIONS:",
        "- [EXTRACT] fields: find the value verbatim in the passages above.",
        "- [INFER] fields: read the full context and use your intelligence to produce",
        "  a concise, accurate label/description. Do NOT look for the field name literally.",
        "  Example for website_theme: read what the company does, then write",
        "  '2-5 word label' like 'Chemical Safety & Compliance' or 'E-commerce Analytics'.",
        "- For URL/website fields: use the 'Current page URL' above unless the text",
        "  explicitly states a different homepage URL for the entity.",
        "- Do NOT use internal sub-page links (/blog/, /news/, /solutions/) as the URL.",
        '- Use "field" as the key name (not "id", not "name").',
        "- Return ONLY the JSON object. No markdown. No explanation.",
    ]
    return "\n".join(parts)


def build_retry_message(previous_response: str, error: str) -> str:
    return (
        f"Your previous response was not valid JSON. The JSON parser returned this error: {error}\n\n"
        f"Here is what you generated:\n{previous_response}\n\n"
        "Please fix the formatting error (e.g., missing commas, brackets, or braces) and return ONLY the valid JSON object. "
        "Start with { and end with }."
    )
