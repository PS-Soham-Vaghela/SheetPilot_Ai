"""
retriever.py — FAISS-backed vector store for webpage chunks.

Switched from ChromaDB to faiss-cpu to avoid the C++ build tools requirement
on Windows. The logic and interface are identical — index_page() and search()
behave the same way from the orchestrator's perspective.

Each page load gets its own ephemeral FAISS index (keyed by URL hash).
Old indexes are evicted when the in-memory store grows beyond MAX_INDEXES.

Flow:
  1. index_page(page_text, page_url)  →  chunks, embeds, stores in FAISS
  2. search(query, page_url, k=5)     →  embeds query, L2 search, returns top-k
"""

import hashlib
import logging
import os
from typing import Optional

import numpy as np
import faiss

from backend.rag.chunker import chunk_text, TextChunk
from backend.rag.embedder import embed_texts, embed_query, embedding_dim
from backend.models.schemas import RetrievedPassage

logger = logging.getLogger(__name__)

RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "3"))
MAX_INDEXES: int = 20   # evict LRU when we exceed this many cached page indexes

# ── In-memory index store ─────────────────────────────────────────────────────
# { url_hash: { "index": faiss.Index, "texts": [str], "ids": [str] } }
_store: dict[str, dict] = {}
_lru: list[str] = []   # most-recently-used order (last = MRU)


def _url_key(page_url: str) -> str:
    return hashlib.md5(page_url.encode()).hexdigest()[:16]


def _evict_if_needed():
    while len(_store) >= MAX_INDEXES:
        oldest = _lru.pop(0)
        _store.pop(oldest, None)
        logger.debug("Evicted FAISS index for key %s", oldest)


# ── Public API ────────────────────────────────────────────────────────────────
MAX_PAGE_WORDS: int = int(os.getenv("MAX_PAGE_WORDS", "1500"))  # 1500 → ~10 chunks at 200w = fast

def index_page(page_text: str, page_url: str) -> int:
    """
    Chunk, embed, and store in a FAISS flat index.
    Skip re-indexing if the same URL+content hash is already cached.
    """
    words = page_text.split()
    if len(words) > MAX_PAGE_WORDS:
        page_text = " ".join(words[:MAX_PAGE_WORDS])
        logger.debug("Page text trimmed to %d words", MAX_PAGE_WORDS)

    key      = _url_key(page_url)
    txt_hash = hashlib.md5(page_text.encode()).hexdigest()[:16]

    # ── Cache hit: same URL and same content → skip re-embedding ─────────────
    existing = _store.get(key)
    if existing and existing.get("txt_hash") == txt_hash:
        logger.info("RAG cache HIT for %s — skipping re-index", page_url)
        if key in _lru:
            _lru.remove(key)
        _lru.append(key)
        return existing.get("chunk_count", 0)
    key = _url_key(page_url)

    chunks: list[TextChunk] = chunk_text(page_text, source_url=page_url)
    if not chunks:
        logger.warning("No chunks produced for %s", page_url)
        return 0

    texts = [c.text for c in chunks]
    ids   = [c.chunk_id for c in chunks]

    embeddings: np.ndarray = embed_texts(texts)  # shape (N, dim), float32, L2-normed

    dim = embedding_dim()
    # IndexFlatIP = inner product; since embeddings are L2-normed, IP == cosine similarity
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    _evict_if_needed()
    _store[key] = {"index": index, "texts": texts, "ids": ids,
                   "page_url": page_url, "txt_hash": txt_hash,
                   "chunk_count": len(chunks)}

    # Update LRU order
    if key in _lru:
        _lru.remove(key)
    _lru.append(key)

    logger.info("FAISS indexed %d chunks for %s", len(chunks), page_url)
    return len(chunks)


def _compute_lexical_scores(query: str, texts: list[str]) -> list[float]:
    """Compute simple TF-IDF lexical scores for a query across a list of texts."""
    import math
    from collections import Counter
    
    # Preprocess query and texts into lowercase word lists
    query_words = [w.lower() for w in query.split() if len(w) > 1]
    if not query_words:
        return [0.0] * len(texts)
        
    doc_words = [[w.lower() for w in t.split()] for t in texts]
    N = len(texts)
    
    # Calculate Document Frequency (DF)
    df = Counter()
    for words in doc_words:
        unique_words = set(words)
        for w in unique_words:
            if w in query_words:
                df[w] += 1
                
    # Calculate TF-IDF score for each doc
    scores = []
    for words in doc_words:
        score = 0.0
        word_counts = Counter(words)
        total_words = len(words) or 1
        for qw in query_words:
            if df[qw] > 0:
                tf = word_counts[qw] / total_words
                idf = math.log(1 + N / df[qw])
                score += tf * idf
        scores.append(score)
        
    # Normalise lexical scores to [0, 1]
    max_score = max(scores) if scores else 0
    if max_score > 0:
        return [s / max_score for s in scores]
    return [0.0] * len(texts)


def search(
    query: str,
    page_url: str,
    k: int = RAG_TOP_K,
) -> list[RetrievedPassage]:
    """
    Retrieve top-k passages using Hybrid RAG search (FAISS dense + TF-IDF lexical).

    Args:
        query:    The search query — typically the names of the missing Excel fields.
        page_url: URL of the page to search within.
        k:        Number of passages to return.

    Returns:
        List of RetrievedPassage sorted by descending relevance score.
    """
    key = _url_key(page_url)
    entry = _store.get(key)

    if entry is None:
        logger.warning("No FAISS index for %s — was index_page() called?", page_url)
        return []

    # Update LRU
    if key in _lru:
        _lru.remove(key)
    _lru.append(key)

    n_total = entry["index"].ntotal
    if n_total == 0:
        return []

    # 1. Semantic search (dense vector)
    query_emb: np.ndarray = embed_query(query).reshape(1, -1)
    
    # Retrieve all candidates to perform fusion
    scores, indices = entry["index"].search(query_emb, n_total)
    
    # Map from index to semantic score (normalized to [0, 1])
    semantic_map = {}
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        semantic_map[idx] = float((score + 1.0) / 2.0)

    # 2. Lexical search (sparse TF-IDF)
    lexical_scores = _compute_lexical_scores(query, entry["texts"])

    # 3. Hybrid fusion (Linear Interpolation)
    # alpha = 0.7 (70% semantic, 30% lexical)
    alpha = 0.7
    hybrid_results = []
    
    for idx in range(n_total):
        sem_score = semantic_map.get(idx, 0.0)
        lex_score = lexical_scores[idx]
        combined_score = alpha * sem_score + (1.0 - alpha) * lex_score
        
        hybrid_results.append((combined_score, idx))

    # Sort by hybrid score descending and take top k
    hybrid_results.sort(key=lambda x: x[0], reverse=True)
    top_k_results = hybrid_results[:k]

    passages: list[RetrievedPassage] = []
    for score, idx in top_k_results:
        passages.append(
            RetrievedPassage(
                text=entry["texts"][idx],
                score=round(min(max(score, 0.0), 1.0), 4),
                chunk_id=entry["ids"][idx],
            )
        )

    return passages


def clear_page_index(page_url: str) -> bool:
    """Remove the FAISS index for a page URL."""
    key = _url_key(page_url)
    removed = _store.pop(key, None) is not None
    if key in _lru:
        _lru.remove(key)
    return removed
