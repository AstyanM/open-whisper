"""Tests for ChromaDB vector store and multilingual embedding."""

import numpy as np
import pytest
import pytest_asyncio

from src.search.embedding import MultilingualEmbeddingFunction
from src.search.vector_store import (
    init_vector_store,
    close_vector_store,
    index_session,
    delete_session_embedding,
    search_sessions,
    get_collection,
)


def ids_from(results: list[tuple[int, float, str]]) -> list[int]:
    """Extract session IDs from search results."""
    return [sid for sid, *_ in results]


@pytest_asyncio.fixture
async def vector_store(tmp_path):
    """Initialize a temporary ChromaDB store."""
    db_path = str(tmp_path / "test.db")
    await init_vector_store(db_path)
    yield
    await close_vector_store()


@pytest.mark.asyncio
async def test_index_and_search(vector_store):
    await index_session(
        session_id=1,
        full_text="We discussed the quarterly sales report and revenue targets",
        language="en",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="Recipe for chocolate cake with vanilla frosting",
        language="en",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-16T10:00:00Z",
    )

    results = await search_sessions("business meeting about sales")
    assert len(results) == 2
    assert ids_from(results)[0] == 1  # More relevant


@pytest.mark.asyncio
async def test_delete_embedding(vector_store):
    await index_session(
        session_id=1,
        full_text="Test session content for deletion",
        language="fr",
        mode="dictation",
        duration_s=30.0,
        started_at="2026-01-15T10:00:00Z",
    )

    collection = get_collection()
    assert collection.count() == 1

    await delete_session_embedding(1)
    assert collection.count() == 0


@pytest.mark.asyncio
async def test_empty_text_not_indexed(vector_store):
    await index_session(
        session_id=1,
        full_text="",
        language="fr",
        mode="transcription",
        duration_s=0.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="   ",
        language="fr",
        mode="transcription",
        duration_s=0.0,
        started_at="2026-01-15T10:00:00Z",
    )

    collection = get_collection()
    assert collection.count() == 0


@pytest.mark.asyncio
async def test_search_with_language_filter(vector_store):
    await index_session(
        session_id=1,
        full_text="Bonjour, nous avons discute du projet",
        language="fr",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="Hello, we discussed the project",
        language="en",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-15T10:00:00Z",
    )

    results = await search_sessions(
        "project discussion",
        where={"language": "en"},
    )
    assert len(results) == 1
    assert ids_from(results)[0] == 2


@pytest.mark.asyncio
async def test_search_empty_collection(vector_store):
    results = await search_sessions("anything")
    assert results == []


@pytest.mark.asyncio
async def test_upsert_updates_existing(vector_store):
    await index_session(
        session_id=1,
        full_text="Original text about cats",
        language="en",
        mode="transcription",
        duration_s=30.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=1,
        full_text="Updated text about dogs and puppies",
        language="en",
        mode="transcription",
        duration_s=30.0,
        started_at="2026-01-15T10:00:00Z",
    )

    collection = get_collection()
    assert collection.count() == 1

    results = await search_sessions("dogs puppies")
    assert ids_from(results)[0] == 1


# ── Multilingual Embedding Function Tests ──────────────────────────────


@pytest.fixture(scope="module")
def embedding_fn():
    """Load the multilingual embedding function once for all embedding tests."""
    return MultilingualEmbeddingFunction(
        model_name="paraphrase-multilingual-MiniLM-L12-v2"
    )


class TestEmbeddingFunction:
    """Direct tests for the MultilingualEmbeddingFunction."""

    def test_embedding_produces_valid_shape(self, embedding_fn):
        """Embeddings should be 384-dim numeric vectors."""
        result = embedding_fn(["Hello world"])
        assert len(result) == 1
        assert len(result[0]) == 384
        assert all(isinstance(v, (int, float, np.floating)) for v in result[0])

    def test_embedding_batch(self, embedding_fn):
        """Batch embedding should return one vector per input."""
        texts = ["First sentence", "Second sentence", "Third sentence"]
        result = embedding_fn(texts)
        assert len(result) == 3
        for vec in result:
            assert len(vec) == 384

    def test_embedding_is_normalized(self, embedding_fn):
        """Embeddings should be L2-normalized (unit vectors)."""
        result = embedding_fn(["Test normalization"])
        norm = np.linalg.norm(result[0])
        assert abs(norm - 1.0) < 1e-5, f"Expected unit norm, got {norm}"

    def test_embedding_deterministic(self, embedding_fn):
        """Same input should produce identical embeddings."""
        text = "Deterministic check"
        result1 = embedding_fn([text])
        result2 = embedding_fn([text])
        np.testing.assert_array_almost_equal(result1[0], result2[0], decimal=6)

    def test_embedding_empty_input(self, embedding_fn):
        """Empty input list should return empty list (bypassing ChromaDB validation)."""
        result = embedding_fn._embed([])
        assert result == []

    def test_embed_query_matches_call(self, embedding_fn):
        """embed_query() and __call__() should produce the same embeddings."""
        text = ["Query text for comparison"]
        result_call = embedding_fn(text)
        result_query = embedding_fn.embed_query(text)
        np.testing.assert_array_almost_equal(
            result_call[0], result_query[0], decimal=6
        )

    def test_different_texts_produce_different_embeddings(self, embedding_fn):
        """Semantically different texts should have distinct embeddings."""
        result = embedding_fn([
            "The weather is sunny today",
            "Quantum mechanics describes subatomic particles",
        ])
        cosine_sim = np.dot(result[0], result[1])
        assert cosine_sim < 0.9, f"Expected distinct embeddings, cosine_sim={cosine_sim}"

    def test_similar_texts_have_high_similarity(self, embedding_fn):
        """Semantically similar texts should have high cosine similarity."""
        result = embedding_fn([
            "The cat sat on the mat",
            "A cat was sitting on the rug",
        ])
        cosine_sim = np.dot(result[0], result[1])
        assert cosine_sim > 0.7, f"Expected high similarity, cosine_sim={cosine_sim}"

    def test_french_text_embedding(self, embedding_fn):
        """French text should produce valid embeddings (not garbage)."""
        result = embedding_fn([
            "Bonjour, comment allez-vous aujourd'hui ?",
            "Le médecin a prescrit un traitement pour la grippe",
        ])
        assert len(result) == 2
        for vec in result:
            assert len(vec) == 384
            norm = np.linalg.norm(vec)
            assert abs(norm - 1.0) < 1e-5

    def test_multilingual_similarity(self, embedding_fn):
        """Same meaning in different languages should have high similarity."""
        result = embedding_fn([
            "The doctor prescribed medicine for the flu",
            "Le médecin a prescrit un médicament contre la grippe",
        ])
        cosine_sim = np.dot(result[0], result[1])
        assert cosine_sim > 0.7, (
            f"Expected cross-language similarity > 0.7, got {cosine_sim}"
        )

    def test_name_method(self, embedding_fn):
        """name() should return a string containing the model name."""
        name = embedding_fn.name()
        assert "paraphrase-multilingual-MiniLM-L12-v2" in name


# ── French Search Relevance Tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_french_search_relevance(vector_store):
    """French queries should rank French content by semantic relevance."""
    await index_session(
        session_id=1,
        full_text=(
            "Une fille parle de médecine et de son parcours en tant que docteur. "
            "Elle explique les traitements pour les maladies respiratoires."
        ),
        language="fr",
        mode="transcription",
        duration_s=300.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text=(
            "Discussion sur la cuisine japonaise et les recettes de sushi. "
            "On parle des ingrédients et de la préparation du riz."
        ),
        language="fr",
        mode="transcription",
        duration_s=200.0,
        started_at="2026-01-16T10:00:00Z",
    )
    await index_session(
        session_id=3,
        full_text=(
            "Cours de programmation Python pour débutants. "
            "Variables, boucles et fonctions de base."
        ),
        language="fr",
        mode="transcription",
        duration_s=180.0,
        started_at="2026-01-17T10:00:00Z",
    )

    results = await search_sessions("audio d'une fille qui parle de médecine")
    assert len(results) == 3
    assert ids_from(results)[0] == 1, (
        f"Medical session should rank first, got session {ids_from(results)[0]}"
    )


@pytest.mark.asyncio
async def test_french_topic_search(vector_store):
    """Searching a French topic should match the right session."""
    await index_session(
        session_id=10,
        full_text="Réunion sur le budget trimestriel et les objectifs de vente",
        language="fr",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-02-01T10:00:00Z",
    )
    await index_session(
        session_id=11,
        full_text="Explication des exercices de yoga et de méditation pour la relaxation",
        language="fr",
        mode="transcription",
        duration_s=90.0,
        started_at="2026-02-02T10:00:00Z",
    )

    results = await search_sessions("budget et ventes")
    assert ids_from(results)[0] == 10

    results = await search_sessions("yoga relaxation")
    assert ids_from(results)[0] == 11


# ── Cross-Language Search Tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_cross_language_search(vector_store):
    """English query should find semantically matching French content."""
    await index_session(
        session_id=20,
        full_text=(
            "Le patient souffre de douleurs chroniques au dos. "
            "Le médecin recommande de la physiothérapie."
        ),
        language="fr",
        mode="transcription",
        duration_s=150.0,
        started_at="2026-01-20T10:00:00Z",
    )
    await index_session(
        session_id=21,
        full_text=(
            "Nous avons planté des tomates et des courgettes dans le jardin. "
            "L'arrosage se fait deux fois par semaine."
        ),
        language="fr",
        mode="transcription",
        duration_s=100.0,
        started_at="2026-01-21T10:00:00Z",
    )

    results = await search_sessions("back pain physiotherapy doctor")
    assert ids_from(results)[0] == 20, (
        f"Medical session should rank first for English medical query, got {ids_from(results)[0]}"
    )


# ── Model Verification Tests ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_custom_embedding_model_is_used(vector_store):
    """Verify that our custom multilingual model is used, not ChromaDB's default."""
    collection = get_collection()
    metadata = collection.metadata or {}
    assert metadata.get("embedding_model") == "paraphrase-multilingual-MiniLM-L12-v2", (
        f"Expected multilingual model in collection metadata, got: {metadata}"
    )


@pytest.mark.asyncio
async def test_model_change_detection(tmp_path):
    """Changing the embedding model should trigger re-indexing."""
    db_path = str(tmp_path / "test_migration.db")

    # Initialize with default model
    needs_reindex = await init_vector_store(db_path)
    assert not needs_reindex  # First init, no prior collection

    # Index something
    await index_session(
        session_id=1,
        full_text="Test content",
        language="en",
        mode="transcription",
        duration_s=10.0,
        started_at="2026-01-15T10:00:00Z",
    )
    collection = get_collection()
    assert collection.count() == 1
    await close_vector_store()

    # Re-init with same model — should NOT trigger re-index
    needs_reindex = await init_vector_store(db_path)
    assert not needs_reindex
    collection = get_collection()
    assert collection.count() == 1  # Data preserved
    await close_vector_store()

    # Re-init with different model name — should trigger re-index
    needs_reindex = await init_vector_store(
        db_path, embedding_model="all-MiniLM-L6-v2"
    )
    assert needs_reindex  # Model changed
    collection = get_collection()
    assert collection.count() == 0  # Collection was deleted
    await close_vector_store()


# ── Distance Threshold Tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_returns_distances(vector_store):
    """Search results should include distances, with relevant results having lower distances."""
    await index_session(
        session_id=1,
        full_text="Machine learning and artificial intelligence research paper",
        language="en",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="Cooking pasta with tomato sauce and basil",
        language="en",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-16T10:00:00Z",
    )

    results = await search_sessions("deep learning neural networks")
    assert len(results) == 2
    # Each result is (session_id, distance, document)
    for sid, dist, doc in results:
        assert isinstance(sid, int)
        assert isinstance(dist, float)
        assert isinstance(doc, str)
        assert 0.0 <= dist <= 2.0
    # ML session should have lower distance (more relevant)
    assert results[0][0] == 1
    assert results[0][1] < results[1][1]


@pytest.mark.asyncio
async def test_distance_threshold_filters_irrelevant(vector_store):
    """Results above distance threshold should be filtered out."""
    await index_session(
        session_id=1,
        full_text="Discussion about medicine and healthcare treatments for patients",
        language="en",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="Voice transcription settings and microphone configuration guide",
        language="en",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-16T10:00:00Z",
    )

    # Without threshold: returns all results
    all_results = await search_sessions("medicine")
    assert len(all_results) == 2

    # With strict threshold: should filter irrelevant results
    filtered = await search_sessions("medicine", distance_threshold=0.5)
    assert len(filtered) >= 1
    assert filtered[0][0] == 1  # Medicine session first
    for _, dist, _ in filtered:
        assert dist <= 0.5


# ── Summary Indexing Tests ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_index_prefers_summary_over_full_text(vector_store):
    """When a summary is provided, search should match on the summary."""
    await index_session(
        session_id=1,
        full_text="Euh alors on a parlé de plein de trucs pendant une heure voilà quoi",
        summary="Discussion sur les traitements médicaux et la santé des patients",
        language="fr",
        mode="transcription",
        duration_s=300.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="On a discuté de la cuisine et des recettes de pâtisserie",
        language="fr",
        mode="transcription",
        duration_s=200.0,
        started_at="2026-01-16T10:00:00Z",
    )

    results = await search_sessions("médecine")
    assert len(results) >= 1
    assert results[0][0] == 1, "Session with medical summary should rank first"
    # Medical session should be significantly more relevant
    assert results[0][1] < results[1][1] if len(results) > 1 else True


@pytest.mark.asyncio
async def test_index_falls_back_to_full_text(vector_store):
    """Without a summary, full text should be indexed."""
    await index_session(
        session_id=1,
        full_text="Discussion about quantum computing and qubits",
        summary=None,
        language="en",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-01-15T10:00:00Z",
    )

    results = await search_sessions("quantum computing")
    assert len(results) == 1
    assert results[0][0] == 1


# ── Document Return Tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_returns_documents(vector_store):
    """Search results should include the indexed document text."""
    await index_session(
        session_id=1,
        full_text="Original long transcript about gardening tips",
        summary="Tips for growing tomatoes in your garden",
        language="en",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-01-15T10:00:00Z",
    )

    results = await search_sessions("tomato garden")
    assert len(results) == 1
    sid, dist, doc = results[0]
    assert sid == 1
    # Document should be the summary (preferred over full_text)
    assert "tomatoes" in doc.lower()
    assert "garden" in doc.lower()


# ── Exact Match Helper Tests ──────────────────────────────────────


class TestExactMatchHelpers:
    """Tests for the exact match and stopword logic in routes."""

    def test_strip_accents(self):
        from src.api.routes.search import _strip_accents
        assert _strip_accents("médecine") == "medecine"
        assert _strip_accents("français") == "francais"
        assert _strip_accents("hello") == "hello"
        assert _strip_accents("über") == "uber"

    def test_is_exact_match_basic(self):
        from src.api.routes.search import _is_exact_match
        doc = "Discussion sur les traitements médicaux et la médecine"
        assert _is_exact_match("médecine", doc) is True
        assert _is_exact_match("medecine", doc) is True  # Accent insensitive
        assert _is_exact_match("MÉDECINE", doc) is True  # Case insensitive
        assert _is_exact_match("astronomie", doc) is False

    def test_is_exact_match_stopwords_ignored(self):
        from src.api.routes.search import _is_exact_match
        doc = "Discussion sur les traitements médicaux et la médecine"
        # "de la" are stopwords, only "médecine" is checked
        assert _is_exact_match("de la médecine", doc) is True
        # "audio d'une fille" — "audio" and "fille" are content words not in doc
        assert _is_exact_match("audio d'une fille qui parle de médecine", doc) is False

    def test_is_exact_match_multi_word(self):
        from src.api.routes.search import _is_exact_match
        doc = "Budget trimestriel et objectifs de vente pour 2026"
        assert _is_exact_match("budget vente", doc) is True
        assert _is_exact_match("budget yoga", doc) is False

    def test_is_exact_match_empty_query(self):
        from src.api.routes.search import _is_exact_match
        assert _is_exact_match("", "some document") is False
        assert _is_exact_match("   ", "some document") is False

    def test_is_exact_match_all_stopwords(self):
        from src.api.routes.search import _is_exact_match
        # Query with only stopwords should return False (no content words to match)
        assert _is_exact_match("de la le", "anything") is False
