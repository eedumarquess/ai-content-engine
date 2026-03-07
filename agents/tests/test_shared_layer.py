from __future__ import annotations

import unittest
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from pydantic import BaseModel

from shared import (
    LlmGenerationResult,
    PromptLoader,
    RepairService,
    RetrievalFilters,
    StepRpcRequest,
    TraceWriter,
    WorkerExecutionResult,
    WorkerReplyMetadata,
    build_retrieved_docs_preview,
    build_retrieval_filters_sql,
    build_shared_schema_documents,
    estimate_cost_usd,
    validate_output,
)
from shared.contracts import ApiError, ApiErrorResponse
from shared.schemas import RetrievedDocument


class SharedSchemaExportTests(unittest.TestCase):
    def test_exports_expected_schema_files(self) -> None:
        artifacts = build_shared_schema_documents()

        self.assertEqual(
            set(artifacts.keys()),
            {
                "step-rpc.request.v1.schema.json",
                "step-rpc.success-reply.v1.schema.json",
                "step-rpc.failure-reply.v1.schema.json",
                "retrieval-filters.v1.schema.json",
                "retrieved-document.v1.schema.json",
                "llm-trace-record.v1.schema.json",
            },
        )
        request_schema = artifacts["step-rpc.request.v1.schema.json"]
        self.assertIn("input_json", request_schema["properties"])
        trace_schema = artifacts["llm-trace-record.v1.schema.json"]
        self.assertIn("retrieved_docs_preview", trace_schema["properties"])


class PromptLoaderTests(unittest.TestCase):
    def test_loads_and_renders_versioned_prompt(self) -> None:
        loader = PromptLoader(
            base_dir=Path(__file__).resolve().parents[1] / "prompts"
        )

        loaded = loader.load("repair", "v1")
        rendered = loader.render(
            "repair",
            "v1",
            raw_output='{"broken": true}',
            validation_errors_json="[]",
            expected_schema_json="{}",
            context_json="{}",
        )

        self.assertEqual(loaded.version, "repair_v1")
        self.assertIn("repairing a JSON payload", loaded.template)
        self.assertIn('{"broken": true}', rendered)
        self.assertEqual(loader.latest_version("repair"), "repair_v1")

    def test_can_use_custom_prompt_directory(self) -> None:
        with TemporaryDirectory() as temp_dir:
            prompt_root = Path(temp_dir)
            (prompt_root / "content").mkdir(parents=True, exist_ok=True)
            (prompt_root / "content" / "v1.jinja").write_text(
                "Topic: {{ topic }}",
                encoding="utf-8",
            )
            loader = PromptLoader(base_dir=prompt_root)
            rendered = loader.render("content", "v1", topic="RAG")
            self.assertEqual(rendered, "Topic: RAG")


class RetrievalTests(unittest.TestCase):
    def test_builds_sql_with_filters(self) -> None:
        filters = RetrievalFilters(
            doc_types=["persona", "knowledge"],
            platform="linkedin",
            user_id=uuid4(),
            tags=["rag", "python"],
        )

        where_sql, params = build_retrieval_filters_sql(filters)

        self.assertIn("doc_type = ANY", where_sql)
        self.assertIn("(platform IS NULL OR platform = %s)", where_sql)
        self.assertIn("(user_id IS NULL OR user_id = %s::uuid)", where_sql)
        self.assertIn("tags && %s::text[]", where_sql)
        self.assertEqual(params[0], ["persona", "knowledge"])
        self.assertEqual(params[-1], ["rag", "python"])

    def test_builds_preview_and_uses_zero_default_prices(self) -> None:
        document = RetrievedDocument(
            id=uuid4(),
            doc_type="knowledge",
            content="A" * 300,
        )

        previews = build_retrieved_docs_preview([document], max_chars=20)

        self.assertEqual(len(previews), 1)
        self.assertTrue(previews[0].content_preview.endswith("..."))
        self.assertEqual(
            estimate_cost_usd("ollama", "qwen2.5:7b", tokens_in=1200, tokens_out=800),
            Decimal("0.000000"),
        )


class RepairTests(unittest.IsolatedAsyncioTestCase):
    async def test_validate_output_detects_invalid_payload(self) -> None:
        attempt = validate_output("not-json", DemoSchema)
        self.assertFalse(attempt.is_valid)
        self.assertEqual(attempt.errors[0]["type"], "json_invalid")

    async def test_repair_service_recovers_invalid_output(self) -> None:
        repair_service = RepairService(llm_client=FakeRepairClient())

        outcome = await repair_service.ensure_valid("not-json", DemoSchema)

        self.assertTrue(outcome.repaired)
        self.assertEqual(outcome.repair_attempts, 1)
        self.assertEqual(outcome.output_json["title"], "Recovered")


class WorkerResultTests(unittest.TestCase):
    def test_serializes_success_and_failure_payloads(self) -> None:
        success = WorkerExecutionResult.success(
            output_json={"ok": True},
            reply_metadata=WorkerReplyMetadata(agent_name="content"),
        ).to_wire_payload()
        failure = WorkerExecutionResult.failure(
            error_json=ApiErrorResponse(
                errors=[
                    ApiError(
                        code="internal_error",
                        message="boom",
                        field=None,
                        trace_id="trace-1",
                    )
                ]
            ),
            reply_metadata=WorkerReplyMetadata(agent_name="review"),
        ).to_wire_payload()

        self.assertTrue(success["ok"])
        self.assertEqual(success["reply_metadata"]["agent_name"], "content")
        self.assertFalse(failure["ok"])
        self.assertEqual(failure["error_json"]["errors"][0]["trace_id"], "trace-1")


class WorkerSchemaTests(unittest.TestCase):
    def test_request_contract_matches_expected_shape(self) -> None:
        payload = StepRpcRequest.model_validate(
            {
                "generation_id": str(uuid4()),
                "user_id": str(uuid4()),
                "step_name": "content",
                "input_json": {
                    "request": {
                        "topic": "RAG",
                        "platform": "linkedin",
                        "format": "thread",
                        "persona_id": None,
                    },
                    "generation": {
                        "generation_id": str(uuid4()),
                        "pipeline_preset_id": str(uuid4()),
                        "user_id": str(uuid4()),
                        "pipeline": ["content", "review"],
                        "schema_version": "v1",
                    },
                    "document": None,
                },
                "prompt_version": "v1",
                "config": {
                    "provider": "ollama",
                    "model": "qwen2.5:7b",
                },
            }
        )

        self.assertEqual(payload.config.model, "qwen2.5:7b")
        self.assertIsNone(payload.input_json.document)


class DemoSchema(BaseModel):
    title: str


class FakeRepairClient:
    async def generate_repair(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | dict[str, object] | None = "json",
    ) -> LlmGenerationResult:
        self.last_prompt = prompt
        self.last_system = system
        self.last_response_format = response_format
        return LlmGenerationResult(
            model="qwen2.5:3b",
            text='{"title":"Recovered"}',
        )


if __name__ == "__main__":
    unittest.main()
