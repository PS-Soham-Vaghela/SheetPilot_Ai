"""
embedder.py — wraps sentence-transformers to produce dense embeddings.

Model: all-MiniLM-L6-v2 (22 MB, 384-dim, fast on CPU, good semantic quality)
The model is loaded once at import time and reused for all requests (singleton).
"""

import logging
import os
from functools import lru_cache
from typing import Union

import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")


# ── Singleton model loader ────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def _get_model():
    """Load and cache the SentenceTransformer model (loaded once per process)."""
    from sentence_transformers import SentenceTransformer

    logger.info("Loading embedding model: %s", EMBEDDING_MODEL_NAME)
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    logger.info("Embedding model loaded. Embedding dim: %d", model.get_sentence_embedding_dimension())
    return model


# ── Public API ────────────────────────────────────────────────────────────────
def embed_texts(texts: list[str]) -> np.ndarray:
    """
    Encode a list of strings into a 2-D numpy array of shape (N, 384).

    Args:
        texts: List of strings to embed.

    Returns:
        numpy array of float32 embeddings, shape (len(texts), embedding_dim).
    """
    if not texts:
        return np.empty((0, 384), dtype=np.float32)

    model = _get_model()
    embeddings = model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,   # L2-normalised → cosine sim = dot product
        show_progress_bar=False,
        batch_size=32,
    )
    return embeddings.astype(np.float32)


def embed_query(query: str) -> np.ndarray:
    """
    Encode a single query string. Returns shape (384,).

    Separate from embed_texts so the retriever can call it cleanly.
    """
    result = embed_texts([query])
    return result[0]


def embedding_dim() -> int:
    """Return the embedding dimension for the loaded model."""
    return _get_model().get_sentence_embedding_dimension()
