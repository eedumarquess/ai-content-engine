from __future__ import annotations

from pathlib import Path

from .common import JsonDict, RequiredString, SharedModel
from .retrieval_v1 import RagDocumentType, RerankedDocument, RetrievalFilters, RetrievedDocument
from .trace_v1 import GenerationCostSnapshot, LlmTraceRecord, RetrievedDocumentPreview
from .worker_v1 import (
    PipelineStepName,
    ProviderName,
    StepConfig,
    StepGenerationContext,
    StepInputEnvelope,
    StepRequestPayload,
    StepRpcFailureReply,
    StepRpcRequest,
    StepRpcSuccessReply,
    WorkerReplyMetadata,
)

SHARED_SCHEMA_ARTIFACT_FILENAMES = {
    "step_rpc_request": "step-rpc.request.v1.schema.json",
    "step_rpc_success_reply": "step-rpc.success-reply.v1.schema.json",
    "step_rpc_failure_reply": "step-rpc.failure-reply.v1.schema.json",
    "retrieval_filters": "retrieval-filters.v1.schema.json",
    "retrieved_document": "retrieved-document.v1.schema.json",
    "llm_trace_record": "llm-trace-record.v1.schema.json",
}


def build_shared_schema_documents() -> dict[str, dict[str, object]]:
    return {
        SHARED_SCHEMA_ARTIFACT_FILENAMES["step_rpc_request"]: StepRpcRequest.model_json_schema(),
        SHARED_SCHEMA_ARTIFACT_FILENAMES["step_rpc_success_reply"]: StepRpcSuccessReply.model_json_schema(),
        SHARED_SCHEMA_ARTIFACT_FILENAMES["step_rpc_failure_reply"]: StepRpcFailureReply.model_json_schema(),
        SHARED_SCHEMA_ARTIFACT_FILENAMES["retrieval_filters"]: RetrievalFilters.model_json_schema(),
        SHARED_SCHEMA_ARTIFACT_FILENAMES["retrieved_document"]: RetrievedDocument.model_json_schema(),
        SHARED_SCHEMA_ARTIFACT_FILENAMES["llm_trace_record"]: LlmTraceRecord.model_json_schema(),
    }


def get_shared_schema_output_dir() -> Path:
    return Path(__file__).resolve().parent / "generated"


__all__ = [
    "GenerationCostSnapshot",
    "JsonDict",
    "LlmTraceRecord",
    "PipelineStepName",
    "ProviderName",
    "RagDocumentType",
    "RerankedDocument",
    "RequiredString",
    "RetrievalFilters",
    "RetrievedDocument",
    "RetrievedDocumentPreview",
    "SharedModel",
    "StepConfig",
    "StepGenerationContext",
    "StepInputEnvelope",
    "StepRequestPayload",
    "StepRpcFailureReply",
    "StepRpcRequest",
    "StepRpcSuccessReply",
    "WorkerReplyMetadata",
    "build_shared_schema_documents",
    "get_shared_schema_output_dir",
]
