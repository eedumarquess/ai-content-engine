from __future__ import annotations

from importlib import import_module

_EXPORTS = {
    "EmbeddingResult": ".embedder",
    "LocalReranker": ".reranker",
    "OllamaEmbedder": ".embedder",
    "PgVectorRetriever": ".retriever",
    "build_retrieval_filters_sql": ".retriever",
    "format_pgvector": ".retriever",
}

__all__ = sorted(_EXPORTS)


def __getattr__(name: str) -> object:
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module = import_module(module_name, __name__)
    value = getattr(module, name)
    globals()[name] = value
    return value
