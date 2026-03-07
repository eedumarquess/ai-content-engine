from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from shared.contracts import ApiErrorResponse, SCHEMA_VERSION

from .common import JsonDict, RequiredString, SharedModel

PipelineStepName = Literal["content", "review"]
ProviderName = Literal["ollama"]


class StepConfig(SharedModel):
    provider: ProviderName
    model: RequiredString


class StepRequestPayload(SharedModel):
    topic: RequiredString
    platform: RequiredString
    format: RequiredString
    persona_id: UUID | None = None


class StepGenerationContext(SharedModel):
    generation_id: UUID
    pipeline_preset_id: UUID
    user_id: UUID
    pipeline: list[PipelineStepName] = Field(min_length=1)
    schema_version: Literal[SCHEMA_VERSION]


class StepInputEnvelope(SharedModel):
    request: StepRequestPayload
    generation: StepGenerationContext
    document: JsonDict | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_document(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized.setdefault("document", None)
        return normalized


class StepRpcRequest(SharedModel):
    generation_id: UUID
    user_id: UUID
    step_name: PipelineStepName
    input_json: StepInputEnvelope
    prompt_version: RequiredString
    config: StepConfig


class WorkerReplyMetadata(SharedModel):
    agent_name: str | None = None
    provider: str | None = None
    model: str | None = None
    prompt_version: str | None = None
    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    repair_attempts: int = Field(default=0, ge=0)
    trace_id: str | None = None


class StepRpcSuccessReply(SharedModel):
    ok: Literal[True] = True
    output_json: JsonDict
    reply_metadata: WorkerReplyMetadata


class StepRpcFailureReply(SharedModel):
    ok: Literal[False] = False
    error_json: ApiErrorResponse
    output_json: JsonDict | None = None
    reply_metadata: WorkerReplyMetadata

    @model_validator(mode="before")
    @classmethod
    def normalize_output(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized.setdefault("output_json", None)
        return normalized
