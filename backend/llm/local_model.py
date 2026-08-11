"""
local_model.py — Groq API LLM client for SheetPilot AI.

Replaces the local Ollama backend with Groq's cloud inference API.

Why Groq:
- LPU (Language Processing Unit) inference: 500-800 tokens/sec
- Typical response time for our JSON payloads: 1-3s (vs 15-25s with local qwen2.5:3b)
- OpenAI-compatible SDK — minimal code change
- Free tier available at console.groq.com

Model: llama-3.1-8b-instant (default)
  - Best latency on Groq's LPU
  - Strong JSON instruction-following
  - Free tier: 30 req/min, 14,400 req/day, 6000 tokens/min

Alternative models (set GROQ_MODEL in .env):
  - llama-3.3-70b-versatile  → highest accuracy, slightly slower
  - mixtral-8x7b-32768       → large context window
  - gemma2-9b-it             → good balance

API key:
  - Get yours free at https://console.groq.com/keys
  - Set GROQ_API_KEY in your .env file
"""

import json
import logging
import os
import re
from typing import Optional

from groq import Groq, APIError, RateLimitError, AuthenticationError

from backend.models.schemas import FieldMapping, LLMOutput
from backend.llm.prompt_templates import SYSTEM_PROMPT, build_retry_message

logger = logging.getLogger(__name__)

# ── Config (all overridable via .env) ─────────────────────────────────────────
GROQ_API_KEY:  str   = os.getenv("GROQ_API_KEY", "")           # ← paste your key in .env
GROQ_MODEL:    str   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
MAX_RETRIES:   int   = 3       # Groq usually returns valid JSON, but can occasionally miss braces
TEMPERATURE:   float = 0.0     # deterministic extraction
MAX_TOKENS:    int   = int(os.getenv("LLM_MAX_TOKENS", "600"))  # JSON output is compact

# ── Singleton Groq client ─────────────────────────────────────────────────────
_client: Optional[Groq] = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not GROQ_API_KEY:
            raise RuntimeError(
                "GROQ_API_KEY is not set. "
                "Get a free key at https://console.groq.com/keys "
                "and add it to your .env file as: GROQ_API_KEY=your_key_here"
            )
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


# ── JSON extraction helpers ───────────────────────────────────────────────────
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json(raw: str) -> str:
    """Strip markdown fences if present, then find the JSON object."""
    m = _JSON_FENCE_RE.search(raw)
    if m:
        return m.group(1).strip()
    start = raw.find("{")
    end   = raw.rfind("}")
    if start != -1 and end > start:
        return raw[start:end + 1]
    return raw.strip()


def _parse_llm_output(raw: str, expected_row: int) -> LLMOutput:
    """Parse and validate the LLM's JSON response into a typed LLMOutput."""
    json_str = _extract_json(raw)
    data = json.loads(json_str)
    data["row"] = data.get("row", expected_row)

    FAKE_VALUES = {
        "missing", "n/a", "na", "none", "not found", "unknown",
        "not available", "no data", "null", "", "-", "—",
    }

    valid = []
    for m in data.get("mappings", []):
        # Accept "field", "id", "name", "key" — defensive against model variation
        field_val = m.get("field") or m.get("id") or m.get("name") or m.get("key") or ""
        value_val = m.get("value") or m.get("val") or m.get("text") or ""
        field_val = str(field_val).strip()
        value_val = str(value_val).strip()

        if not field_val:
            continue
        if value_val.lower() in FAKE_VALUES:
            if field_val not in data.get("missing_fields", []):
                data.setdefault("missing_fields", []).append(field_val)
            continue

        conf = m.get("confidence", "low")
        if conf not in {"high", "medium", "low"}:
            conf = "low"

        valid.append(FieldMapping(
            field=field_val,
            value=value_val,
            confidence=conf,
            source=m.get("source", "")[:200],
        ))

    return LLMOutput(
        row=data["row"],
        mappings=valid,
        missing_fields=data.get("missing_fields", []),
    )


# ── Public API ────────────────────────────────────────────────────────────────
def run(
    user_message: str,
    active_row: int,
    model: Optional[str] = None,
) -> LLMOutput:
    """
    Call Groq API and return a validated LLMOutput.

    Args:
        user_message: Built by prompt_templates.build_user_message()
        active_row:   The Excel row being filled (used as fallback in output)
        model:        Override model name (defaults to GROQ_MODEL env var)

    Returns:
        LLMOutput with .mappings and .missing_fields populated.
    """
    model_name = model or GROQ_MODEL
    client     = _get_client()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_message},
    ]

    last_raw   = ""
    last_error = ""

    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            logger.warning("Groq LLM retry %d due to: %s", attempt, last_error)
            # We don't append last_raw as an assistant message because it might violate json_object constraints.
            # Instead, the full invalid response is included in the build_retry_message user prompt.
            messages.append({
                "role": "user",
                "content": build_retry_message(last_raw, last_error),
            })

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS,
                response_format={"type": "json_object"},
            )
            last_raw = response.choices[0].message.content or ""
            logger.info(
                "Groq response model=%s tokens=%d chars=%d: %s",
                model_name,
                response.usage.completion_tokens if response.usage else -1,
                len(last_raw),
                last_raw[:300],
            )
            return _parse_llm_output(last_raw, expected_row=active_row)

        except json.JSONDecodeError as exc:
            last_error = str(exc)

        except RateLimitError as exc:
            logger.error("Groq rate limit hit: %s", exc)
            raise RuntimeError(
                "Groq API rate limit reached. Wait a moment and try again. "
                "Free tier: 30 requests/min, 6000 tokens/min."
            ) from exc

        except AuthenticationError as exc:
            logger.error("Groq auth error: %s", exc)
            raise RuntimeError(
                "Invalid GROQ_API_KEY. "
                "Get a free key at https://console.groq.com/keys "
                "and update GROQ_API_KEY in your .env file."
            ) from exc

        except APIError as exc:
            logger.error("Groq API error: %s", exc)
            raise RuntimeError(f"Groq API error: {exc}") from exc

        except Exception as exc:
            logger.error("Unexpected error calling Groq: %s", exc)
            raise

    raise RuntimeError(
        f"Groq returned unparseable JSON after {MAX_RETRIES + 1} attempt(s). "
        f"Error: {last_error} | Response: {last_raw[:1000]}"
    )


def check_ollama_connection(model: Optional[str] = None) -> dict:
    """
    Health check — renamed kept for API compatibility with main.py.
    Verifies Groq API key is set and makes a lightweight models list call.
    """
    model_name = model or GROQ_MODEL
    if not GROQ_API_KEY:
        return {
            "ok":      False,
            "model":   model_name,
            "message": (
                "GROQ_API_KEY not set. "
                "Add it to .env: GROQ_API_KEY=your_key_here  "
                "(free key at https://console.groq.com/keys)"
            ),
        }
    try:
        client = _get_client()
        models = client.models.list()
        available = [m.id for m in models.data]
        ok = any(model_name in m for m in available)
        return {
            "ok":               ok,
            "model":            model_name,
            "available_models": available,
            "message":          (
                f"Groq API ready. Model '{model_name}' available."
                if ok else
                f"Groq API reachable but model '{model_name}' not found. "
                f"Available: {available[:5]}"
            ),
        }
    except AuthenticationError:
        return {
            "ok":      False,
            "model":   model_name,
            "message": "GROQ_API_KEY is invalid. Check https://console.groq.com/keys",
        }
    except Exception as exc:
        return {
            "ok":      False,
            "model":   model_name,
            "message": f"Cannot reach Groq API: {exc}",
        }


def chat(prompt: str) -> str:
    """Call Groq API for generic conversational chat (no JSON requirement)."""
    model_name = GROQ_MODEL
    client     = _get_client()

    messages = [
        {"role": "system", "content": "You are a helpful assistant answering questions about a spreadsheet workbook. Use only the provided context. Be extremely concise."},
        {"role": "user",   "content": prompt},
    ]

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.2,
            max_tokens=800,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("Error in chat LLM call: %s", exc)
        return f"Error: {exc}"
