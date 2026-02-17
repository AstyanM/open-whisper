"""Semantic + metadata session search endpoint."""

import json
import logging
import math
import unicodedata
from pathlib import Path

from fastapi import APIRouter

from src.search.vector_store import search_sessions as chroma_search
from src.api._helpers import _get_repo, _session_to_dict

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Search helpers (exact-match ranking, stopword filtering)
# ---------------------------------------------------------------------------

_STOPWORDS_PATH = Path(__file__).resolve().parent.parent.parent / "search" / "stopwords.json"
_STOPWORDS: set[str] = set()


def _strip_accents(text: str) -> str:
    """Remove accents/diacritics for accent-insensitive matching."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _get_stopwords() -> set[str]:
    """Lazy-load stopwords on first use, returning empty set if file missing."""
    global _STOPWORDS
    if _STOPWORDS:
        return _STOPWORDS
    try:
        with open(_STOPWORDS_PATH, encoding="utf-8") as f:
            _STOPWORDS = {w for words in json.load(f).values() for w in words}
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning("Could not load stopwords from %s: %s", _STOPWORDS_PATH, e)
        _STOPWORDS = set()
    return _STOPWORDS


def _is_exact_match(query: str, document: str) -> bool:
    """Check if ALL non-stopword query words appear in the document (case + accent insensitive)."""
    stopwords = _get_stopwords()
    norm_doc = _strip_accents(document).lower()
    words = _strip_accents(query).lower().split()
    content_words = [w for w in words if w not in stopwords]
    return all(w in norm_doc for w in content_words) if content_words else False


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/api/sessions/search")
async def search_sessions_endpoint(
    q: str = "",
    language: str | None = None,
    mode: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    duration_min: float | None = None,
    duration_max: float | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Search sessions with optional semantic query and metadata filters."""
    repo = _get_repo()
    session_ids = None
    relevance_scores: dict[int, float] = {}
    exact_matches: set[int] = set()

    if q.strip():
        # Build ChromaDB where clause for metadata pre-filtering
        where_clauses = []
        if language:
            where_clauses.append({"language": language})
        if mode:
            where_clauses.append({"mode": mode})

        chroma_where = None
        if len(where_clauses) == 1:
            chroma_where = where_clauses[0]
        elif len(where_clauses) > 1:
            chroma_where = {"$and": where_clauses}

        # Load distance threshold from config
        from src.main import config as app_config
        threshold = app_config.search.distance_threshold if app_config else 0.75

        try:
            search_results = await chroma_search(
                query=q.strip(),
                n_results=limit + offset,
                where=chroma_where,
                distance_threshold=threshold,
            )

            # Classify exact matches (all query words in document)
            for sid, d, doc in search_results:
                if _is_exact_match(q.strip(), doc):
                    exact_matches.add(sid)

            # Rank: exact matches first (by distance), then non-exact (by distance)
            exact = [(sid, d) for sid, d, _ in search_results if sid in exact_matches]
            non_exact = [(sid, d) for sid, d, _ in search_results if sid not in exact_matches]
            ranked = exact + non_exact

            session_ids = [sid for sid, _ in ranked]
            relevance_scores = {
                sid: round(math.sqrt(max(0.0, 1.0 - d)), 4)
                for sid, d in ranked
            }
        except Exception as e:
            logger.warning(f"ChromaDB search failed, falling back to SQL: {e}")
            session_ids = None

    sessions = await repo.filter_sessions(
        session_ids=session_ids,
        language=language if session_ids is None else None,  # Already filtered in ChromaDB
        mode=mode if session_ids is None else None,
        date_from=date_from,
        date_to=date_to,
        duration_min=duration_min,
        duration_max=duration_max,
        limit=limit,
        offset=offset,
    )

    previews = await repo.get_session_previews([s.id for s in sessions])
    return {
        "sessions": [
            _session_to_dict(
                s,
                preview=previews.get(s.id, ""),
                relevance=relevance_scores.get(s.id),
                exact_match=s.id in exact_matches if exact_matches else None,
            )
            for s in sessions
        ],
    }
