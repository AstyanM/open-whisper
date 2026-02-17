"""LLM post-processing endpoints (summarize, rewrite, process)."""

import logging

from fastapi import APIRouter, HTTPException, Request

from src.llm.client import is_llm_available, summarize_text, rewrite_text, process_text
from src.search.vector_store import index_session
from src.api._helpers import _get_repo

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/sessions/{session_id}/summarize")
async def summarize_session(session_id: int):
    """Generate or regenerate a summary for a session using LLM."""
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="LLM not configured or disabled")

    repo = _get_repo()
    session = await repo.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    full_text = await repo.get_session_full_text(session_id)
    if not full_text or not full_text.strip():
        raise HTTPException(status_code=400, detail="Session has no text to summarize")

    try:
        summary = await summarize_text(full_text, language=session.language)
    except Exception as e:
        logger.error(f"LLM summarization failed for session {session_id}: {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    await repo.update_session_summary(session_id, summary)

    # Re-index in ChromaDB with the summary for better search relevance
    try:
        await index_session(
            session_id=session_id,
            full_text=full_text,
            summary=summary,
            language=session.language,
            mode=session.mode,
            duration_s=session.duration_s,
            started_at=session.started_at,
        )
    except Exception as e:
        logger.warning(f"Failed to re-index session {session_id} after summary: {e}")

    return {"session_id": session_id, "summary": summary}


@router.post("/api/llm/rewrite")
async def rewrite_text_endpoint(request: Request):
    """Rewrite/clean up arbitrary text using LLM."""
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="LLM not configured or disabled")

    body = await request.json()
    text = body.get("text", "")
    instruction = body.get("instruction")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        result = await rewrite_text(text, instruction)
    except Exception as e:
        logger.error(f"LLM rewrite failed: {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    return {"original": text, "rewritten": result}


@router.post("/api/llm/process")
async def process_text_endpoint(request: Request):
    """Process transcription text with a scenario-specific LLM prompt."""
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="LLM not configured or disabled")

    body = await request.json()
    text = body.get("text", "")
    scenario = body.get("scenario", "")
    language = body.get("language", "en")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    if not scenario:
        raise HTTPException(status_code=400, detail="No scenario provided")

    try:
        result = await process_text(text, scenario, language)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"LLM process failed (scenario={scenario}): {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    return {"scenario": scenario, "result": result}
