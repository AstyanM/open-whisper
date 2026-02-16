"""ChromaDB vector store for semantic session search."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import chromadb

logger = logging.getLogger(__name__)

_client: Any = None
_collection: Any = None


async def init_vector_store(db_path: str) -> None:
    """Initialize ChromaDB PersistentClient next to the SQLite DB."""
    global _client, _collection
    chroma_dir = str(Path(db_path).parent / "chroma")
    loop = asyncio.get_event_loop()
    _client = await loop.run_in_executor(
        None, lambda: chromadb.PersistentClient(path=chroma_dir)
    )
    _collection = await loop.run_in_executor(
        None,
        lambda: _client.get_or_create_collection(
            name="sessions",
            metadata={"hnsw:space": "cosine"},
        ),
    )
    logger.info(f"ChromaDB initialized at {chroma_dir}")


async def close_vector_store() -> None:
    """Clean up (ChromaDB PersistentClient auto-persists)."""
    global _client, _collection
    _client = None
    _collection = None


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
) -> None:
    """Index or update a session's text in ChromaDB."""
    if not full_text.strip():
        return

    collection = get_collection()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: collection.upsert(
            ids=[str(session_id)],
            documents=[full_text],
            metadatas=[{
                "session_id": session_id,
                "language": language,
                "mode": mode,
                "duration_s": duration_s or 0.0,
                "started_at": started_at,
            }],
        ),
    )
    logger.debug(f"Indexed session {session_id} in ChromaDB")


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
) -> list[int]:
    """Semantic search. Returns ordered list of session_ids by relevance."""
    collection = get_collection()
    loop = asyncio.get_event_loop()

    kwargs: dict = {
        "query_texts": [query],
        "n_results": min(n_results, collection.count() or 1),
    }
    if where:
        kwargs["where"] = where

    results = await loop.run_in_executor(
        None,
        lambda: collection.query(**kwargs),
    )

    return [int(sid) for sid in (results["ids"][0] if results["ids"] else [])]
