"""ChromaDB vector store for semantic session search."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import chromadb

from src.search.embedding import MultilingualEmbeddingFunction

logger = logging.getLogger(__name__)

_client: Any = None
_collection: Any = None
_embedding_fn: Any = None


async def init_vector_store(
    db_path: str,
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2",
) -> bool:
    """Initialize ChromaDB PersistentClient next to the SQLite DB.

    Returns True if existing collection was deleted (model or strategy change)
    and re-indexing is needed.
    """
    global _client, _collection, _embedding_fn
    chroma_dir = str(Path(db_path).parent / "chroma")
    loop = asyncio.get_event_loop()

    # Load embedding model (may download on first run)
    _embedding_fn = await loop.run_in_executor(
        None, lambda: MultilingualEmbeddingFunction(model_name=embedding_model)
    )

    _client = await loop.run_in_executor(
        None, lambda: chromadb.PersistentClient(path=chroma_dir)
    )

    # Check if existing collection uses a different embedding model or indexing strategy
    needs_reindex = False
    current_strategy = "summary_preferred"
    existing_names = await loop.run_in_executor(
        None, lambda: [c.name for c in _client.list_collections()]
    )
    if "sessions" in existing_names:
        existing = await loop.run_in_executor(
            None, lambda: _client.get_collection("sessions")
        )
        stored_model = (existing.metadata or {}).get("embedding_model", "")
        stored_strategy = (existing.metadata or {}).get("index_strategy", "full_text")
        if stored_model != embedding_model:
            logger.warning(
                "Embedding model changed (%r -> %r). "
                "Deleting ChromaDB collection for re-indexing.",
                stored_model, embedding_model,
            )
            await loop.run_in_executor(
                None, lambda: _client.delete_collection("sessions")
            )
            needs_reindex = True
        elif stored_strategy != current_strategy:
            logger.warning(
                "Index strategy changed (%r -> %r). "
                "Deleting ChromaDB collection for re-indexing.",
                stored_strategy, current_strategy,
            )
            await loop.run_in_executor(
                None, lambda: _client.delete_collection("sessions")
            )
            needs_reindex = True

    _collection = await loop.run_in_executor(
        None,
        lambda: _client.get_or_create_collection(
            name="sessions",
            metadata={
                "hnsw:space": "cosine",
                "embedding_model": embedding_model,
                "index_strategy": current_strategy,
            },
            embedding_function=_embedding_fn,
        ),
    )
    logger.info("ChromaDB initialized at %s with model %s (strategy=%s)", chroma_dir, embedding_model, current_strategy)
    return needs_reindex


async def close_vector_store() -> None:
    """Clean up (ChromaDB PersistentClient auto-persists)."""
    global _client, _collection, _embedding_fn
    _client = None
    _collection = None
    _embedding_fn = None


def get_collection() -> Any:
    if _collection is None:
        raise RuntimeError("Vector store not initialized")
    return _collection


async def index_session(
    session_id: int,
    full_text: str,
    language: str,
    mode: str,
    duration_s: float | None,
    started_at: str,
    summary: str | None = None,
) -> None:
    """Index or update a session's text in ChromaDB.

    When a summary is available, it is indexed instead of the full text
    because concise summaries produce more topic-focused embeddings.
    """
    document = summary if summary and summary.strip() else full_text
    if not document.strip():
        return

    collection = get_collection()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: collection.upsert(
            ids=[str(session_id)],
            documents=[document],
            metadatas=[{
                "session_id": session_id,
                "language": language,
                "mode": mode,
                "duration_s": duration_s or 0.0,
                "started_at": started_at,
            }],
        ),
    )
    logger.debug(f"Indexed session {session_id} in ChromaDB (source={'summary' if summary and summary.strip() else 'full_text'})")


async def delete_session_embedding(session_id: int) -> None:
    """Remove a session from the ChromaDB index."""
    collection = get_collection()
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None,
            lambda: collection.delete(ids=[str(session_id)]),
        )
    except Exception:
        logger.warning(f"Failed to delete session {session_id} from ChromaDB")


async def search_sessions(
    query: str,
    n_results: int = 50,
    where: dict | None = None,
    distance_threshold: float | None = None,
) -> list[tuple[int, float, str]]:
    """Semantic search. Returns ordered list of (session_id, distance, document) by relevance.

    Distance is cosine distance: 0.0 = identical, 2.0 = opposite.
    Results with distance > distance_threshold are filtered out.
    """
    collection = get_collection()
    loop = asyncio.get_event_loop()

    kwargs: dict = {
        "query_texts": [query],
        "n_results": min(n_results, collection.count() or 1),
        "include": ["distances", "documents"],
    }
    if where:
        kwargs["where"] = where

    results = await loop.run_in_executor(
        None,
        lambda: collection.query(**kwargs),
    )

    ids = results["ids"][0] if results["ids"] else []
    distances = results["distances"][0] if results["distances"] else []
    documents = results["documents"][0] if results.get("documents") else [""] * len(ids)

    pairs = list(zip(
        [int(sid) for sid in ids],
        [float(d) for d in distances],
        [str(doc) for doc in documents],
    ))

    if distance_threshold is not None:
        pairs = [(sid, d, doc) for sid, d, doc in pairs if d <= distance_threshold]

    return pairs
