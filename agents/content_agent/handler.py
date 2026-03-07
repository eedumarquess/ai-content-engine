from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from shared.contracts import ApiError, ApiErrorResponse, GenerationDocumentV1
from shared.llm import LlmGenerationResult
from shared.prompts import PromptLoader
from shared.rabbit import WorkerExecutionResult
from shared.repair import RepairExhaustedError, RepairService, parse_json_payload
from shared.schemas import (
    LlmTraceRecord,
    RetrievalFilters,
    RerankedDocument,
    RetrievedDocument,
    StepRpcRequest,
    WorkerReplyMetadata,
)
from shared.tracing import TraceWriter, build_retrieved_docs_preview


class ContentRetriever(Protocol):
    async def retrieve(
        self,
        query: str,
        *,
        filters: RetrievalFilters | None = None,
        top_k: int | None = None,
    ) -> list[RetrievedDocument]: ...


class ContentReranker(Protocol):
    async def rerank(
        self,
        query: str,
        documents: Sequence[RetrievedDocument],
        *,
        top_k: int = 5,
    ) -> list[RerankedDocument]: ...


class ContentLlmClient(Protocol):
    async def generate_main(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | dict[str, Any] | None = None,
    ) -> LlmGenerationResult: ...


@dataclass(slots=True)
class ContextBlocks:
    persona_context: str
    knowledge_context: str
    performance_context: str
    performance_context_used: bool


def build_content_query(request: StepRpcRequest) -> str:
    parts = []
    persona_id = request.input_json.request.persona_id
    if persona_id is not None:
        parts.append(str(persona_id))
    parts.extend(
        [
            request.input_json.request.topic,
            request.input_json.request.format,
            request.input_json.request.platform,
        ]
    )
    return " | ".join(parts)


def group_context_blocks(documents: Sequence[RerankedDocument]) -> ContextBlocks:
    grouped: dict[str, list[RerankedDocument]] = defaultdict(list)
    for document in documents:
        grouped[document.doc_type].append(document)

    performance_context = _render_context_block(grouped["performance"])
    return ContextBlocks(
        persona_context=_render_context_block(grouped["persona"]),
        knowledge_context=_render_context_block(grouped["knowledge"]),
        performance_context=performance_context,
        performance_context_used=bool(grouped["performance"]),
    )


def finalize_generation_document(
    document: GenerationDocumentV1,
    request: StepRpcRequest,
    *,
    performance_context_used: bool,
) -> GenerationDocumentV1:
    payload = document.model_dump(mode="json", exclude_none=False)
    payload["topic"] = request.input_json.request.topic
    payload["metadata"] = {
        **payload["metadata"],
        "platform": request.input_json.request.platform,
        "format": request.input_json.request.format,
        "pipeline": list(request.input_json.generation.pipeline),
        "generation_id": str(request.generation_id),
        "schema_version": "v1",
        "persona_id": (
            str(request.input_json.request.persona_id)
            if request.input_json.request.persona_id is not None
            else None
        ),
        "performance_context_used": performance_context_used,
    }
    return GenerationDocumentV1.model_validate(payload)


class ContentStepHandler:
    agent_name = "content"

    def __init__(
        self,
        *,
        retriever: ContentRetriever,
        reranker: ContentReranker,
        prompt_loader: PromptLoader,
        llm_client: ContentLlmClient,
        repair_service: RepairService,
        trace_writer: TraceWriter,
    ) -> None:
        self.retriever = retriever
        self.reranker = reranker
        self.prompt_loader = prompt_loader
        self.llm_client = llm_client
        self.repair_service = repair_service
        self.trace_writer = trace_writer

    async def handle(self, request: StepRpcRequest) -> WorkerExecutionResult:
        if request.step_name != "content":
            return WorkerExecutionResult.failure(
                error_json=ApiErrorResponse(
                    errors=[
                        ApiError(
                            code="validation_error",
                            message="Content agent only handles the content step.",
                            field="step_name",
                            trace_id=str(request.generation_id),
                        )
                    ]
                ),
                reply_metadata=self._build_reply_metadata(
                    request=request,
                    repair_attempts=0,
                ),
            )

        query = build_content_query(request)
        filters = RetrievalFilters(
            doc_types=["persona", "knowledge", "performance"],
            platform=request.input_json.request.platform,
            user_id=request.user_id,
        )
        retrieved_docs = await self.retriever.retrieve(query, filters=filters, top_k=20)
        reranked_docs = await self.reranker.rerank(query, retrieved_docs, top_k=5)
        context_blocks = group_context_blocks(reranked_docs)
        prompt = self.prompt_loader.render(
            "content",
            request.prompt_version,
            topic=request.input_json.request.topic,
            platform=request.input_json.request.platform,
            format=request.input_json.request.format,
            persona_id=request.input_json.request.persona_id,
            generation_id=request.generation_id,
            pipeline=request.input_json.generation.pipeline,
            persona_context=context_blocks.persona_context,
            knowledge_context=context_blocks.knowledge_context,
            performance_context=context_blocks.performance_context,
            output_schema_json=json.dumps(
                GenerationDocumentV1.model_json_schema(),
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            ),
        )
        llm_response = await self.llm_client.generate_main(
            prompt,
            response_format="json",
        )
        repair_context = {
            "request": request.model_dump(mode="json"),
            "retrieval_filters": filters.model_dump(mode="json"),
            "retrieved_doc_ids": [str(document.id) for document in reranked_docs],
        }

        try:
            repair_outcome = await self.repair_service.ensure_valid(
                llm_response.text,
                GenerationDocumentV1,
                context=repair_context,
            )
            finalized_document = finalize_generation_document(
                repair_outcome.model,
                request,
                performance_context_used=context_blocks.performance_context_used,
            )
            output_json = finalized_document.model_dump(mode="json", exclude_none=False)
            trace_record = LlmTraceRecord(
                generation_id=request.generation_id,
                step_name="content",
                agent_name=self.agent_name,
                provider=llm_response.provider,
                model=request.config.model,
                prompt_version=request.prompt_version,
                prompt_text=prompt,
                retrieved_doc_ids=[document.id for document in reranked_docs],
                retrieved_docs_preview=build_retrieved_docs_preview(reranked_docs),
                tokens_in=llm_response.prompt_tokens,
                tokens_out=llm_response.completion_tokens,
                latency_ms=llm_response.total_duration_ms,
                output_json=output_json,
            )
            await self.trace_writer.write(trace_record)
            return WorkerExecutionResult.success(
                output_json=output_json,
                reply_metadata=self._build_reply_metadata(
                    request=request,
                    llm_response=llm_response,
                    repair_attempts=repair_outcome.repair_attempts,
                ),
            )
        except RepairExhaustedError as error:
            partial_output = _extract_partial_output(error.raw_output)
            trace_record = LlmTraceRecord(
                generation_id=request.generation_id,
                step_name="content",
                agent_name=self.agent_name,
                provider=llm_response.provider,
                model=request.config.model,
                prompt_version=request.prompt_version,
                prompt_text=prompt,
                retrieved_doc_ids=[document.id for document in reranked_docs],
                retrieved_docs_preview=build_retrieved_docs_preview(reranked_docs),
                tokens_in=llm_response.prompt_tokens,
                tokens_out=llm_response.completion_tokens,
                latency_ms=llm_response.total_duration_ms,
                output_json=partial_output,
                error_json={
                    "code": "repair_exhausted",
                    "message": str(error),
                    "validation_errors": error.errors,
                },
            )
            await self.trace_writer.write(trace_record)
            return WorkerExecutionResult.failure(
                error_json=ApiErrorResponse(
                    errors=[
                        ApiError(
                            code="repair_exhausted",
                            message="Repair attempts exhausted.",
                            field=None,
                            trace_id=str(request.generation_id),
                        )
                    ]
                ),
                output_json=partial_output,
                reply_metadata=self._build_reply_metadata(
                    request=request,
                    llm_response=llm_response,
                    repair_attempts=error.attempts,
                ),
            )

    def _build_reply_metadata(
        self,
        *,
        request: StepRpcRequest,
        llm_response: LlmGenerationResult | None = None,
        repair_attempts: int,
    ) -> WorkerReplyMetadata:
        return WorkerReplyMetadata(
            agent_name=self.agent_name,
            provider="ollama",
            model=request.config.model,
            prompt_version=request.prompt_version,
            tokens_in=llm_response.prompt_tokens if llm_response is not None else 0,
            tokens_out=llm_response.completion_tokens if llm_response is not None else 0,
            latency_ms=llm_response.total_duration_ms if llm_response is not None else 0,
            repair_attempts=repair_attempts,
            trace_id=str(request.generation_id),
        )


def _render_context_block(documents: Sequence[RerankedDocument]) -> str:
    rendered_chunks = []
    for index, document in enumerate(documents, start=1):
        source = document.source or "unknown"
        platform = document.platform or "global"
        tags = ", ".join(document.tags) if document.tags else "-"
        rendered_chunks.append(
            "\n".join(
                [
                    f"[doc {index}] source={source}",
                    f"type={document.doc_type} platform={platform}",
                    f"score={document.score:.4f} rerank_score={document.rerank_score:.4f}",
                    f"tags={tags}",
                    document.content.strip(),
                ]
            )
        )
    return "\n\n".join(rendered_chunks)


def _extract_partial_output(raw_output: str) -> dict[str, Any] | None:
    try:
        return parse_json_payload(raw_output)
    except ValueError:
        return None
