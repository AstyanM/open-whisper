"""Multilingual ONNX embedding function for ChromaDB.

Replaces ChromaDB's default all-MiniLM-L6-v2 (English-optimized) with
paraphrase-multilingual-MiniLM-L12-v2 (50+ languages, 384-dim).
Uses onnxruntime and tokenizers — both already chromadb dependencies.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from tokenizers import Tokenizer

logger = logging.getLogger(__name__)

_REPO_PREFIX = "sentence-transformers"
_CACHE_DIR = Path.home() / ".cache" / "chroma" / "onnx_models"
_MAX_LENGTH = 256

# Module-level model name, set once at init so the classmethod name() can access it
_active_model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"


def _download_model(model_name: str) -> Path:
    """Download ONNX model and tokenizer from HuggingFace Hub. Returns model dir."""
    from huggingface_hub import hf_hub_download

    repo_id = f"{_REPO_PREFIX}/{model_name}"
    model_dir = _CACHE_DIR / model_name

    # Try onnx/model.onnx first (full precision), fall back to optimized
    onnx_file = None
    for filename in ("onnx/model.onnx", "onnx/model_O1.onnx"):
        try:
            onnx_file = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=str(model_dir),
            )
            break
        except Exception:
            continue

    if onnx_file is None:
        raise RuntimeError(
            f"Could not find ONNX model in {repo_id}. "
            "Tried onnx/model.onnx and onnx/model_O1.onnx"
        )

    hf_hub_download(
        repo_id=repo_id,
        filename="tokenizer.json",
        local_dir=str(model_dir),
    )

    return model_dir


class MultilingualEmbeddingFunction(EmbeddingFunction[Documents]):
    """ChromaDB embedding function using a multilingual sentence-transformers ONNX model."""

    def __init__(self, model_name: str) -> None:
        global _active_model_name
        _active_model_name = model_name
        self._model_name = model_name
        logger.info("Loading embedding model %s (may download on first run)...", model_name)

        model_dir = _download_model(model_name)

        onnx_path = model_dir / "onnx" / "model.onnx"
        if not onnx_path.exists():
            onnx_path = model_dir / "onnx" / "model_O1.onnx"

        tokenizer_path = model_dir / "tokenizer.json"

        self._ort_session = ort.InferenceSession(
            str(onnx_path),
            providers=["CPUExecutionProvider"],
        )
        self._tokenizer = Tokenizer.from_file(str(tokenizer_path))
        self._tokenizer.enable_padding(pad_id=0, pad_token="[PAD]", length=_MAX_LENGTH)
        self._tokenizer.enable_truncation(max_length=_MAX_LENGTH)

        # Detect available input names from the ONNX model
        self._input_names = {inp.name for inp in self._ort_session.get_inputs()}

        logger.info("Embedding model %s loaded (inputs: %s)", model_name, self._input_names)

    @staticmethod
    def name() -> str:
        return f"multilingual-onnx-{_active_model_name}"

    def _embed(self, input: Documents) -> Embeddings:
        """Core embedding logic: tokenize, run ONNX, mean-pool, normalize."""
        if not input:
            return []

        encodings = self._tokenizer.encode_batch(input)

        input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

        feeds: dict[str, Any] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }
        if "token_type_ids" in self._input_names:
            feeds["token_type_ids"] = np.zeros_like(input_ids, dtype=np.int64)

        outputs = self._ort_session.run(None, feeds)

        # outputs[0] = last_hidden_state: (batch, seq_len, hidden_dim)
        token_embeddings = outputs[0]

        # Mean pooling with attention mask
        mask_expanded = np.expand_dims(attention_mask, axis=-1).astype(np.float32)
        sum_embeddings = np.sum(token_embeddings * mask_expanded, axis=1)
        sum_mask = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
        mean_embeddings = sum_embeddings / sum_mask

        # L2 normalize
        norms = np.linalg.norm(mean_embeddings, axis=1, keepdims=True)
        norms = np.clip(norms, a_min=1e-9, a_max=None)
        normalized = mean_embeddings / norms

        return normalized.tolist()

    def __call__(self, input: Documents) -> Embeddings:
        """Embed documents for indexing."""
        return self._embed(input)

    def embed_query(self, input: Documents) -> Embeddings:
        """Embed query text for search (same logic as document embedding)."""
        return self._embed(input)
