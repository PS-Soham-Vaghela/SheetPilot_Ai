"""
embedder.py — wraps sentence-transformers or lightweight fast vectorizer.

Optimized for cloud deployment (Render free tier 512MB RAM):
Uses lightweight fast hashing embeddings if torch is unavailable or USE_LIGHTWEIGHT_RAG is set,
avoiding Out-Of-Memory crashes.
"""

import hashlib
import logging
import math
import os
import re
from functools import lru_cache
from typing import Union

import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
USE_LIGHTWEIGHT: bool = os.getenv("USE_LIGHTWEIGHT_RAG", "true").lower() in ("true", "1", "yes")


# ── Lightweight 384-dim feature vectorizer (zero PyTorch RAM) ─────────────────
def _lightweight_embed(texts: list[str], dim: int = 384) -> np.ndarray:
    """Fast, deterministic feature-hashing embedding. 0MB RAM overhead."""
    if not texts:
        return np.empty((0, dim), dtype=np.float32)

    vecs = np.zeros((len(texts), dim), dtype=np.float32)
    for i, text in enumerate(texts):
        tokens = re.findall(r"\b\w+\b", text.lower())
        if not tokens:
            continue
        for tok in tokens:
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            idx = h % dim
            sign = 1.0 if ((h >> 8) & 1) else -1.0
            vecs[i, idx] += sign
        # L2-normalize
        norm = np.linalg.norm(vecs[i])
        if norm > 0:
            vecs[i] /= norm
    return vecs


# ── SentenceTransformer loader (used only if explicitly enabled) ──────────────
@lru_cache(maxsize=1)
def _get_model():
    if USE_LIGHTWEIGHT:
        return None
    try:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model: %s", EMBEDDING_MODEL_NAME)
        model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info("Embedding model loaded. Dim: %d", model.get_sentence_embedding_dimension())
        return model
    except Exception as exc:
        logger.warning("Could not load sentence_transformers (%s), using lightweight vectorizer.", exc)
        return None


# ── Public API ────────────────────────────────────────────────────────────────
def embed_texts(texts: list[str]) -> np.ndarray:
    if not texts:
        return np.empty((0, 384), dtype=np.float32)

    model = _get_model()
    if model is not None:
        try:
            embeddings = model.encode(
                texts,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                batch_size=16,
            )
            return embeddings.astype(np.float32)
        except Exception as exc:
            logger.warning("Dense embedding failed (%s), falling back to lightweight.", exc)

    return _lightweight_embed(texts, dim=384)


def embed_query(query: str) -> np.ndarray:
    result = embed_texts([query])
    return result[0]


def embedding_dim() -> int:
    return 384
