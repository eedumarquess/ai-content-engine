from __future__ import annotations

import unittest
from pathlib import Path
from uuid import uuid4

from review_agent.handler import (
    ReviewStepHandler,
    build_review_query,
    finalize_review_document,
    group_review_context_blocks,
)
from shared.contracts import GenerationDocumentV1
from shared.llm import LlmGenerationResult
from shared.prompts import PromptLoader
from shared.repair import RepairService
from shared.schemas import RerankedDocument, RetrievedDocument, StepRpcRequest


def build_request(
    *,
    step_name: str = "review",
    prompt_version: str = "v1",
    include_document: bool = True,
    performance_context_used: bool | None = False,
) -> StepRpcRequest:
    generation_id = uuid4()
    user_id = uuid4()
    persona_id = uuid4()
    document = valid_generation_payload()
    document["metadata"]["generation_id"] = str(generation_id)
    document["metadata"]["persona_id"] = str(persona_id)
    document["metadata"]["performance_context_used"] = performance_context_used

    return StepRpcRequest.model_validate(
        {
            "generation_id": str(generation_id),
            "user_id": str(user_id),
            "step_name": step_name,
            "input_json": {
                "request": {
                    "topic": "RAG em producao",
                    "platform": "linkedin",
                    "format": "thread",
                    "persona_id": str(persona_id),
                },
                "generation": {
                    "generation_id": str(generation_id),
                    "pipeline_preset_id": str(uuid4()),
                    "user_id": str(user_id),
                    "pipeline": ["content", "review"],
                    "schema_version": "v1",
                },
                "document": document if include_document else None,
            },
            "prompt_version": prompt_version,
            "config": {
                "provider": "ollama",
                "model": "qwen2.5:7b",
            },
        }
    )


def build_document(
    *,
    doc_type: str,
    content: str,
    rerank_score: float,
    score: float = 0.5,
) -> RerankedDocument:
    return RerankedDocument(
        id=uuid4(),
        doc_type=doc_type,
        platform="linkedin",
        source=f"seed:{doc_type}",
        tags=[doc_type, "linkedin"],
        content=content,
        score=score,
        rerank_score=rerank_score,
    )


class ReviewHandlerHelpersTests(unittest.TestCase):
    def test_build_review_query_uses_quality_platform_style_and_document(self) -> None:
        request = build_request()
        document = GenerationDocumentV1.model_validate(request.input_json.document)

        query = build_review_query(request, document)

        self.assertIn("review", query)
        self.assertIn("clareza", query)
        self.assertIn(request.input_json.request.platform, query)
        self.assertIn(request.input_json.request.format, query)
        self.assertIn(document.post.hook, query)

    def test_group_review_context_blocks_marks_performance_usage_only_when_selected(self) -> None:
        without_performance = group_review_context_blocks(
            [
                build_document(
                    doc_type="persona",
                    content="Persona doc",
                    rerank_score=0.9,
                ),
                build_document(
                    doc_type="knowledge",
                    content="Knowledge doc",
                    rerank_score=0.8,
                ),
            ]
        )
        with_performance = group_review_context_blocks(
            [
                build_document(
                    doc_type="performance",
                    content="Performance doc",
                    rerank_score=0.95,
                )
            ]
        )

        self.assertFalse(without_performance.performance_context_used)
        self.assertEqual(without_performance.performance_context, "")
        self.assertTrue(with_performance.performance_context_used)
        self.assertIn("Performance doc", with_performance.performance_context)

    def test_finalize_review_document_overrides_deterministic_metadata(self) -> None:
        request = build_request()
        document = GenerationDocumentV1.model_validate(valid_generation_payload())

        finalized = finalize_review_document(
            document,
            request,
            performance_context_used=True,
        )

        self.assertEqual(finalized.topic, request.input_json.request.topic)
        self.assertEqual(finalized.metadata.platform, request.input_json.request.platform)
        self.assertEqual(finalized.metadata.format, request.input_json.request.format)
        self.assertEqual(finalized.metadata.generation_id, request.generation_id)
        self.assertEqual(finalized.metadata.pipeline, ["content", "review"])
        self.assertEqual(finalized.metadata.persona_id, request.input_json.request.persona_id)
        self.assertTrue(finalized.metadata.performance_context_used)


class ReviewStepHandlerTests(unittest.IsolatedAsyncioTestCase):
    async def test_handler_uses_retrieval_filters_and_returns_valid_document(self) -> None:
        request = build_request()
        retriever = FakeRetriever(
            documents=[
                RetrievedDocument(
                    id=uuid4(),
                    doc_type="persona",
                    platform="linkedin",
                    source="seed:persona",
                    tags=["persona"],
                    content="Mantenha voz rigorosa.",
                    score=0.7,
                ),
                RetrievedDocument(
                    id=uuid4(),
                    doc_type="knowledge",
                    platform="linkedin",
                    source="seed:knowledge",
                    tags=["review"],
                    content="Revise hook, corpo e CTA.",
                    score=0.6,
                ),
            ]
        )
        reranker = FakeReranker(
            documents=[
                build_document(
                    doc_type="persona",
                    content="Mantenha voz rigorosa.",
                    rerank_score=0.95,
                ),
                build_document(
                    doc_type="knowledge",
                    content="Revise hook, corpo e CTA.",
                    rerank_score=0.9,
                ),
            ]
        )
        llm_client = FakeMainLlmClient(
            text=valid_generation_json(hook="Hook revisado"),
        )
        trace_writer = FakeTraceWriter()
        handler = ReviewStepHandler(
            retriever=retriever,
            reranker=reranker,
            prompt_loader=PromptLoader(
                base_dir=Path(__file__).resolve().parents[1] / "prompts"
            ),
            llm_client=llm_client,
            repair_service=RepairService(llm_client=FakeRepairClient.unused()),
            trace_writer=trace_writer,
        )

        result = await handler.handle(request)

        self.assertTrue(result.error_json is None)
        self.assertEqual(retriever.last_top_k, 20)
        self.assertEqual(
            retriever.last_filters.doc_types,
            ["persona", "knowledge", "performance"],
        )
        self.assertEqual(retriever.last_filters.platform, "linkedin")
        self.assertEqual(retriever.last_filters.user_id, request.user_id)
        self.assertEqual(reranker.last_top_k, 5)
        self.assertEqual(result.reply_metadata.repair_attempts, 0)
        self.assertEqual(result.output_json["post"]["hook"], "Hook revisado")
        self.assertEqual(result.output_json["metadata"]["platform"], "linkedin")
        self.assertEqual(result.output_json["metadata"]["performance_context_used"], False)
        self.assertEqual(len(trace_writer.records), 1)
        self.assertEqual(trace_writer.records[0].prompt_version, "v1")
        self.assertEqual(len(trace_writer.records[0].retrieved_doc_ids), 2)

    async def test_handler_requires_input_document(self) -> None:
        request = build_request(include_document=False)
        handler = ReviewStepHandler(
            retriever=FakeRetriever(documents=[]),
            reranker=FakeReranker(documents=[]),
            prompt_loader=PromptLoader(
                base_dir=Path(__file__).resolve().parents[1] / "prompts"
            ),
            llm_client=FakeMainLlmClient(text=valid_generation_json()),
            repair_service=RepairService(llm_client=FakeRepairClient.unused()),
            trace_writer=FakeTraceWriter(),
        )

        result = await handler.handle(request)

        self.assertIsNotNone(result.error_json)
        self.assertEqual(result.error_json.errors[0].field, "input_json.document")
        self.assertEqual(result.reply_metadata.tokens_in, 0)

    async def test_handler_marks_performance_context_used_when_input_or_top_five_uses_it(self) -> None:
        request = build_request(prompt_version="v2", performance_context_used=True)
        handler = ReviewStepHandler(
            retriever=FakeRetriever(documents=[]),
            reranker=FakeReranker(
                documents=[
                    build_document(
                        doc_type="performance",
                        content="Posts com benchmark performam melhor.",
                        rerank_score=0.93,
                    )
                ]
            ),
            prompt_loader=PromptLoader(
                base_dir=Path(__file__).resolve().parents[1] / "prompts"
            ),
            llm_client=FakeMainLlmClient(text=valid_generation_json()),
            repair_service=RepairService(llm_client=FakeRepairClient.unused()),
            trace_writer=FakeTraceWriter(),
        )

        result = await handler.handle(request)

        self.assertEqual(result.output_json["metadata"]["performance_context_used"], True)
        self.assertEqual(result.reply_metadata.prompt_version, "v2")

    async def test_handler_repairs_invalid_output(self) -> None:
        request = build_request()
        handler = ReviewStepHandler(
            retriever=FakeRetriever(documents=[]),
            reranker=FakeReranker(documents=[]),
            prompt_loader=PromptLoader(
                base_dir=Path(__file__).resolve().parents[1] / "prompts"
            ),
            llm_client=FakeMainLlmClient(text="not-json"),
            repair_service=RepairService(llm_client=FakeRepairClient.success()),
            trace_writer=FakeTraceWriter(),
        )

        result = await handler.handle(request)

        self.assertTrue(result.error_json is None)
        self.assertEqual(result.reply_metadata.repair_attempts, 1)
        self.assertEqual(result.output_json["post"]["hook"], "Hook recuperado")

    async def test_handler_returns_repair_exhausted_failure_with_partial_output(self) -> None:
        request = build_request()
        trace_writer = FakeTraceWriter()
        handler = ReviewStepHandler(
            retriever=FakeRetriever(documents=[]),
            reranker=FakeReranker(documents=[]),
            prompt_loader=PromptLoader(
                base_dir=Path(__file__).resolve().parents[1] / "prompts"
            ),
            llm_client=FakeMainLlmClient(text="not-json"),
            repair_service=RepairService(llm_client=FakeRepairClient.invalid()),
            trace_writer=trace_writer,
        )

        result = await handler.handle(request)

        self.assertIsNotNone(result.error_json)
        self.assertEqual(result.error_json.errors[0].code, "repair_exhausted")
        self.assertEqual(result.reply_metadata.repair_attempts, 3)
        self.assertIsNone(result.output_json)
        self.assertEqual(trace_writer.records[0].error_json["code"], "repair_exhausted")

    async def test_handler_rejects_non_review_step(self) -> None:
        request = build_request(step_name="content")
        handler = ReviewStepHandler(
            retriever=FakeRetriever(documents=[]),
            reranker=FakeReranker(documents=[]),
            prompt_loader=PromptLoader(
                base_dir=Path(__file__).resolve().parents[1] / "prompts"
            ),
            llm_client=FakeMainLlmClient(text=valid_generation_json()),
            repair_service=RepairService(llm_client=FakeRepairClient.unused()),
            trace_writer=FakeTraceWriter(),
        )

        result = await handler.handle(request)

        self.assertIsNotNone(result.error_json)
        self.assertEqual(result.error_json.errors[0].code, "validation_error")
        self.assertEqual(result.reply_metadata.tokens_in, 0)


class FakeRetriever:
    def __init__(self, *, documents: list[RetrievedDocument]) -> None:
        self.documents = documents
        self.last_query: str | None = None
        self.last_filters = None
        self.last_top_k: int | None = None

    async def retrieve(self, query: str, *, filters=None, top_k=None) -> list[RetrievedDocument]:
        self.last_query = query
        self.last_filters = filters
        self.last_top_k = top_k
        return list(self.documents)


class FakeReranker:
    def __init__(self, *, documents: list[RerankedDocument]) -> None:
        self.documents = documents
        self.last_query: str | None = None
        self.last_top_k: int | None = None

    async def rerank(self, query: str, documents, *, top_k=5) -> list[RerankedDocument]:
        self.last_query = query
        self.last_top_k = top_k
        return list(self.documents)


class FakeMainLlmClient:
    def __init__(self, *, text: str) -> None:
        self.text = text

    async def generate_main(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | dict[str, object] | None = None,
    ) -> LlmGenerationResult:
        self.last_prompt = prompt
        self.last_response_format = response_format
        return LlmGenerationResult(
            model="qwen2.5:7b",
            text=self.text,
            prompt_tokens=111,
            completion_tokens=222,
            total_duration_ms=333,
        )


class FakeRepairClient:
    def __init__(self, *, response_text: str, fail_if_called: bool = False) -> None:
        self.response_text = response_text
        self.fail_if_called = fail_if_called

    @classmethod
    def success(cls) -> "FakeRepairClient":
        return cls(response_text=valid_generation_json(hook="Hook recuperado"))

    @classmethod
    def invalid(cls) -> "FakeRepairClient":
        return cls(response_text="still-not-json")

    @classmethod
    def unused(cls) -> "FakeRepairClient":
        return cls(response_text="", fail_if_called=True)

    async def generate_repair(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | dict[str, object] | None = "json",
    ) -> LlmGenerationResult:
        if self.fail_if_called:
            raise AssertionError("Repair should not have been called.")
        return LlmGenerationResult(
            model="qwen2.5:3b",
            text=self.response_text,
        )


class FakeTraceWriter:
    def __init__(self) -> None:
        self.records = []

    async def write(self, trace):
        self.records.append(trace)
        return trace, None


def valid_generation_payload() -> dict[str, object]:
    return {
        "topic": "RAG em producao",
        "strategy": {},
        "post": {
            "hook": "Hook inicial",
            "body": "Body inicial",
            "cta": "CTA inicial",
        },
        "media": {},
        "metadata": {
            "platform": "linkedin",
            "format": "thread",
            "pipeline": ["content", "review"],
            "generation_id": "00000000-0000-0000-0000-000000000000",
            "schema_version": "v1",
            "persona_id": None,
            "performance_context_used": False,
        },
    }


def valid_generation_json(*, hook: str = "Hook final") -> str:
    return f"""
    {{
      "topic": "RAG em producao",
      "strategy": {{}},
      "post": {{
        "hook": "{hook}",
        "body": "Body revisado",
        "cta": "CTA revisado"
      }},
      "media": {{}},
      "metadata": {{
        "platform": "linkedin",
        "format": "thread",
        "pipeline": ["content", "review"],
        "generation_id": "00000000-0000-0000-0000-000000000000",
        "schema_version": "v1",
        "persona_id": null,
        "performance_context_used": false
      }}
    }}
    """


if __name__ == "__main__":
    unittest.main()
