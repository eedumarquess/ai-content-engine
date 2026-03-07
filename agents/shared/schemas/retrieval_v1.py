from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from .common import JsonDict, RequiredString, SharedModel

RagDocumentType = Literal["persona", "knowledge", "performance"]


class RetrievalFilters(SharedModel):
    doc_types: list[RagDocumentType] = Field(
        default_factory=lambda: ["persona", "knowledge", "performance"],
        min_length=1,
    )
    platform: str | None = None
    user_id: UUID | None = None
    tags: list[RequiredString] = Field(default_factory=list)


class RetrievedDocument(SharedModel):
    id: UUID
    user_id: UUID | None = None
    doc_type: RagDocumentType
    platform: str | None = None
    structure: str | None = None
    tags: list[str] = Field(default_factory=list)
    source: str | None = None
    content: RequiredString
    metadata: JsonDict = Field(default_factory=dict)
    score: float = 0.0
    created_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized.setdefault("user_id", None)
        normalized.setdefault("platform", None)
        normalized.setdefault("structure", None)
        normalized.setdefault("tags", [])
        normalized.setdefault("source", None)
        normalized.setdefault("metadata", {})
        normalized.setdefault("score", 0.0)
        normalized.setdefault("created_at", None)
        return normalized


class RerankedDocument(RetrievedDocument):
    rerank_score: float = 0.0
