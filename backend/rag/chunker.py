"""
chunker.py — splits raw webpage text into overlapping passages.

Strategy:
- Split by sentence boundaries first (preserves meaning better than fixed char slices).
- Group sentences into windows of ~CHUNK_SIZE tokens with OVERLAP overlap.
- Clean the text before chunking (strip HTML artifacts, normalise whitespace).

Why overlapping chunks?
  A key fact like a GST number can straddle a sentence boundary. Overlap ensures
  no value gets cut off between two adjacent chunks.
"""

import re
import os
from dataclasses import dataclass, field


# ── Config ────────────────────────────────────────────────────────────────────
CHUNK_SIZE: int    = int(os.getenv("CHUNK_SIZE", "200"))    # larger = fewer chunks = faster embedding
CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "30"))


# ── Data classes ──────────────────────────────────────────────────────────────
@dataclass
class TextChunk:
    chunk_id: str
    text: str
    start_word: int
    end_word: int
    word_count: int = field(init=False)

    def __post_init__(self):
        self.word_count = len(self.text.split())


# ── Text cleaning ─────────────────────────────────────────────────────────────
_WHITESPACE_RE = re.compile(r"[^\S\n\r]+")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")


def clean_text(raw: str) -> str:
    """Remove HTML tags, normalise whitespace, strip boilerplate."""
    # Remove any residual HTML tags the content-script may have missed
    text = _HTML_TAG_RE.sub(" ", raw)
    # Collapse multiple blank lines
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    # Normalise all whitespace (tabs, non-breaking spaces, etc.)
    text = _WHITESPACE_RE.sub(" ", text)
    return text.strip()


# ── Sentence splitting ────────────────────────────────────────────────────────
_SENT_BOUNDARY_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def _split_sentences(text: str) -> list[str]:
    """
    Naive sentence splitter. Covers the vast majority of webpage content.
    For production you'd swap in spaCy or NLTK punkt, but both add heavy deps.
    """
    # Also split on newlines — headings and table rows are newline-separated
    lines = text.split("\n")
    sentences: list[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        parts = _SENT_BOUNDARY_RE.split(line)
        sentences.extend(p.strip() for p in parts if p.strip())
    return sentences


# ── Core chunker ──────────────────────────────────────────────────────────────
def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
    source_url: str = "",
) -> list[TextChunk]:
    """
    Split *text* into overlapping word-window chunks.

    Args:
        text:       Raw or pre-cleaned page text.
        chunk_size: Target number of words per chunk.
        overlap:    Number of words shared between adjacent chunks.
        source_url: Attached as metadata (not used here but helps downstream).

    Returns:
        List of TextChunk objects, each with a deterministic chunk_id.
    """
    cleaned = clean_text(text)
    sentences = _split_sentences(cleaned)

    # Flatten all sentences into a word list, tracking sentence boundaries
    words: list[str] = []
    for sentence in sentences:
        words.extend(sentence.split())

    if not words:
        return []

    chunks: list[TextChunk] = []
    step = max(1, chunk_size - overlap)
    total_words = len(words)
    chunk_index = 0
    start = 0

    while start < total_words:
        end = min(start + chunk_size, total_words)
        chunk_words = words[start:end]
        chunk_text_str = " ".join(chunk_words)

        # Deterministic ID: based on position so rebuilding gives the same IDs
        chunk_id = f"chunk_{chunk_index:04d}"
        if source_url:
            # Make IDs unique per page
            import hashlib
            url_hash = hashlib.md5(source_url.encode()).hexdigest()[:6]
            chunk_id = f"{url_hash}_{chunk_index:04d}"

        chunks.append(
            TextChunk(
                chunk_id=chunk_id,
                text=chunk_text_str,
                start_word=start,
                end_word=end,
            )
        )

        chunk_index += 1
        start += step

        # Don't create a tiny tail chunk — merge into previous if < 20 words
        if start < total_words and (total_words - start) < 20:
            # Extend last chunk to end
            remaining = " ".join(words[start:])
            last = chunks[-1]
            chunks[-1] = TextChunk(
                chunk_id=last.chunk_id,
                text=last.text + " " + remaining,
                start_word=last.start_word,
                end_word=total_words,
            )
            break

    return chunks
