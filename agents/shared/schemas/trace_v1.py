from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from .common import JsonDict, RequiredString, SharedModel
from .retrieval_v1 import RagDocumentType
from .worker_v1 import PipelineStepName


class RetrievedDocumentPreview(SharedModel):
    id: UUID
    doc_type: RagDocumentType
    platform: str | None = None
    score: float | None = None
    content_preview: str
    tags: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized.setdefault("platform", None)
        normalized.setdefault("score", None)
        normalized.setdefault("tags", [])
        return normalized


class LlmTraceRecord(SharedModel):
    generation_id: UUID
    step_name: PipelineStepName
    agent_name: RequiredString
    provider: RequiredString
    model: RequiredString
    prompt_version: RequiredString
    prompt_text: RequiredString
    retrieved_doc_ids: list[UUID] = Field(default_factory=list)
    retrieved_docs_preview: list[RetrievedDocumentPreview] = Field(default_factory=list)
    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    cost_usd: Decimal = Field(default=Decimal("0"), ge=0)
    output_json: JsonDict | None = None
    error_json: JsonDict | None = None
    otel_trace_id: str | None = None
    otel_span_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized.setdefault("retrieved_doc_ids", [])
        normalized.setdefault("retrieved_docs_preview", [])
        normalized.setdefault("tokens_in", 0)
        normalized.setdefault("tokens_out", 0)
        normalized.setdefault("latency_ms", 0)
        normalized.setdefault("cost_usd", Decimal("0"))
        normalized.setdefault("output_json", None)
        normalized.setdefault("error_json", None)
        normalized.setdefault("otel_trace_id", None)
        normalized.setdefault("otel_span_id", None)
        return normalized


class GenerationCostSnapshot(SharedModel):
    generation_id: UUID
    total_tokens_in: int = Field(default=0, ge=0)
    total_tokens_out: int = Field(default=0, ge=0)
    total_cost_usd: Decimal = Field(default=Decimal("0"), ge=0)
