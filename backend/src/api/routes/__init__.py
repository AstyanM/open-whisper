"""Aggregated REST API router — includes all domain sub-routers."""

from fastapi import APIRouter

from .health import router as health_router
from .config import router as config_router
from .audio import router as audio_router
from .sessions import router as sessions_router
from .search import router as search_router
from .llm import router as llm_router
from .upload import router as upload_router

router = APIRouter()
for _r in (health_router, config_router, audio_router, search_router,
           sessions_router, llm_router, upload_router):
    router.include_router(_r)
