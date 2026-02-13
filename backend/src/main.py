"""FastAPI application entry point for Voice-to-Speech Local backend."""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import load_config, AppConfig
from src.api.routes import router as api_router

logger = logging.getLogger(__name__)

config: AppConfig | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: load config on startup."""
    global config
    config = load_config()
    logger.info("Configuration loaded successfully")
    logger.info(f"Backend running on {config.backend.host}:{config.backend.port}")
    yield
    logger.info("Shutting down backend")


app = FastAPI(
    title="Voice-to-Speech Local",
    description="Local voice transcription backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:1420",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


def main():
    """Run the backend server."""
    cfg = load_config()
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "src.main:app",
        host=cfg.backend.host,
        port=cfg.backend.port,
        reload=True,
    )


if __name__ == "__main__":
    main()
