from __future__ import annotations

from importlib import import_module

_EXPORTS = {
    "DEFAULT_PRICING_TABLE": ".llm",
    "EmbeddingResult": ".rag",
    "GenerationCostSnapshot": ".schemas",
    "JsonDict": ".schemas",
    "LoadedPrompt": ".prompts",
    "LlmGenerationResult": ".llm",
    "LlmTraceRecord": ".schemas",
    "LocalReranker": ".rag",
    "ModelPricing": ".llm",
    "OllamaClient": ".llm",
    "OllamaEmbedder": ".rag",
    "OllamaGenerationOptions": ".llm",
    "PgVectorRetriever": ".rag",
    "PipelineStepName": ".schemas",
    "PromptLoader": ".prompts",
    "ProviderName": ".schemas",
    "RabbitRpcWorker": ".rabbit",
    "RagDocumentType": ".schemas",
    "RerankedDocument": ".schemas",
    "RepairExhaustedError": ".repair",
    "RepairOutcome": ".repair",
    "RepairService": ".repair",
    "RequiredString": ".schemas",
    "RetrievalFilters": ".schemas",
    "RetrievedDocument": ".schemas",
    "RetrievedDocumentPreview": ".schemas",
    "SharedModel": ".schemas",
    "StepConfig": ".schemas",
    "StepGenerationContext": ".schemas",
    "StepHandler": ".rabbit",
    "StepInputEnvelope": ".schemas",
    "StepRequestPayload": ".schemas",
    "StepRpcFailureReply": ".schemas",
    "StepRpcRequest": ".schemas",
    "StepRpcSuccessReply": ".schemas",
    "TraceWriter": ".tracing",
    "ValidationAttempt": ".repair",
    "WorkerExecutionResult": ".rabbit",
    "WorkerReplyMetadata": ".schemas",
    "build_retrieved_docs_preview": ".tracing",
    "build_retrieval_filters_sql": ".rag",
    "build_shared_schema_documents": ".schemas",
    "estimate_cost_usd": ".llm",
    "format_pgvector": ".rag",
    "get_shared_schema_output_dir": ".schemas",
    "parse_json_payload": ".repair",
    "resolve_pricing": ".llm",
    "validate_output": ".repair",
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
