from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

SCHEMA_VERSION = "v1"

RequiredString = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        pattern=r"\S",
    ),
]

GenerationStatus = Literal["queued", "running", "completed", "failed"]
GenerationStepStatus = Literal["queued", "running", "completed", "failed", "dlq"]
PipelineStepName = Literal["content", "review"]
ApiErrorCode = Literal[
    "authentication_failed",
    "validation_error",
    "pipeline_preset_not_found",
    "generation_not_found",
    "step_failed",
    "step_timeout",
    "repair_exhausted",
    "internal_error",
]


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )


class ApiError(ContractModel):
    code: ApiErrorCode
    message: RequiredString
    field: str | None = None
    trace_id: str | None = None


class ApiErrorResponse(ContractModel):
    errors: list[ApiError]


class GenerateContentRequest(ContractModel):
    topic: RequiredString
    platform: RequiredString
    format: RequiredString
    pipeline_preset_id: UUID
    persona_id: UUID | None = None


class GenerateContentAck(ContractModel):
    generation_id: UUID
    status: Literal["queued"]
    status_url: RequiredString


class GenerationStrategy(ContractModel):
    goal: str | None = None
    angle: str | None = None
    audience: str | None = None


class GenerationPost(ContractModel):
    hook: RequiredString
    body: RequiredString
    cta: RequiredString


class GenerationMedia(ContractModel):
    image_prompt: str | None = None
    carousel: list[str] = Field(default_factory=list)
    video_prompt: str | None = None


class GenerationDocumentMetadata(ContractModel):
    platform: RequiredString
    format: RequiredString
    pipeline: list[PipelineStepName] = Field(min_length=1)
    generation_id: UUID
    schema_version: Literal[SCHEMA_VERSION]
    persona_id: UUID | None = None
    performance_context_used: bool | None = None


class GenerationDocumentV1(ContractModel):
    topic: RequiredString
    strategy: GenerationStrategy
    post: GenerationPost
    media: GenerationMedia
    metadata: GenerationDocumentMetadata


class GenerationStepSummary(ContractModel):
    name: PipelineStepName
    status: GenerationStepStatus
    attempt_count: int = Field(ge=0)


class GenerationExecutionMetadata(ContractModel):
    pipeline_preset_id: UUID
    schema_version: Literal[SCHEMA_VERSION]
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    steps: list[GenerationStepSummary]


class GetGenerationResponse(ContractModel):
    generation_id: UUID
    status: GenerationStatus
    result: GenerationDocumentV1 | None = None
    errors: list[ApiError] = Field(default_factory=list)
    metadata: GenerationExecutionMetadata


SCHEMA_ARTIFACT_FILENAMES = {
    "generate_content_request": "generate-content.request.v1.schema.json",
    "generate_content_ack": "generate-content.ack.v1.schema.json",
    "generation_document": "generation-document.v1.schema.json",
    "generation_status_response": "generation-status.response.v1.schema.json",
}


def build_schema_documents() -> dict[str, dict[str, object]]:
    return {
        SCHEMA_ARTIFACT_FILENAMES["generate_content_request"]: GenerateContentRequest.model_json_schema(),
        SCHEMA_ARTIFACT_FILENAMES["generate_content_ack"]: GenerateContentAck.model_json_schema(),
        SCHEMA_ARTIFACT_FILENAMES["generation_document"]: GenerationDocumentV1.model_json_schema(),
        SCHEMA_ARTIFACT_FILENAMES["generation_status_response"]: GetGenerationResponse.model_json_schema(),
    }


def get_schema_output_dir() -> Path:
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "orchestrator" / "src" / "contracts" / "generated"
