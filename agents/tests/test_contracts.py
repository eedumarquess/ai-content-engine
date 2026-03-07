from __future__ import annotations

import unittest
from uuid import uuid4

from pydantic import ValidationError

from shared.contracts import (
    GenerateContentRequest,
    GenerationDocumentV1,
    SCHEMA_VERSION,
    build_schema_documents,
)


class GenerateContentRequestTests(unittest.TestCase):
    def test_accepts_missing_persona_id_and_normalizes_optional_contract_fields(self) -> None:
        payload = GenerateContentRequest(
            topic="RAG em producao",
            platform="linkedin",
            format="thread",
            pipeline_preset_id=uuid4(),
        )

        self.assertIsNone(payload.persona_id)

    def test_rejects_blank_topic_and_extra_fields(self) -> None:
        with self.assertRaises(ValidationError) as topic_error:
            GenerateContentRequest(
                topic="   ",
                platform="linkedin",
                format="thread",
                pipeline_preset_id=uuid4(),
            )

        self.assertTrue(
            any(error["loc"] == ("topic",) for error in topic_error.exception.errors())
        )

        with self.assertRaises(ValidationError) as extra_error:
            GenerateContentRequest(
                topic="RAG em producao",
                platform="linkedin",
                format="thread",
                pipeline_preset_id=uuid4(),
                unexpected="boom",
            )

        self.assertTrue(
            any(
                error["type"] == "extra_forbidden"
                for error in extra_error.exception.errors()
            )
        )


class GenerationDocumentTests(unittest.TestCase):
    def test_serializes_optional_fields_without_omitting_them(self) -> None:
        generation_id = uuid4()
        document = GenerationDocumentV1(
            topic="RAG em producao",
            strategy={},
            post={
                "hook": "Hook",
                "body": "Body",
                "cta": "CTA",
            },
            media={},
            metadata={
                "platform": "linkedin",
                "format": "thread",
                "pipeline": ["content", "review"],
                "generation_id": generation_id,
                "schema_version": SCHEMA_VERSION,
            },
        )

        payload = document.model_dump(mode="json", exclude_none=False)

        self.assertEqual(payload["media"]["carousel"], [])
        self.assertIsNone(payload["metadata"]["persona_id"])
        self.assertIsNone(payload["metadata"]["performance_context_used"])


class SchemaExportTests(unittest.TestCase):
    def test_exports_all_expected_schema_files(self) -> None:
        artifacts = build_schema_documents()

        self.assertEqual(
            set(artifacts.keys()),
            {
                "generate-content.request.v1.schema.json",
                "generate-content.ack.v1.schema.json",
                "generation-document.v1.schema.json",
                "generation-status.response.v1.schema.json",
            },
        )
        self.assertIn("properties", artifacts["generation-document.v1.schema.json"])
        self.assertIn("metadata", artifacts["generation-document.v1.schema.json"]["properties"])
        document_defs = artifacts["generation-document.v1.schema.json"]["$defs"]
        metadata = document_defs["GenerationDocumentMetadata"]
        strategy = document_defs["GenerationStrategy"]
        media = document_defs["GenerationMedia"]
        self.assertIn(SCHEMA_VERSION, str(metadata))
        self.assertEqual(
            set(strategy["required"]),
            {"goal", "angle", "audience"},
        )
        self.assertEqual(
            set(media["required"]),
            {"image_prompt", "carousel", "video_prompt"},
        )
        self.assertEqual(
            set(metadata["required"]),
            {
                "platform",
                "format",
                "pipeline",
                "generation_id",
                "schema_version",
                "persona_id",
                "performance_context_used",
            },
        )

        status_response = artifacts["generation-status.response.v1.schema.json"]
        status_defs = status_response["$defs"]
        api_error = status_defs["ApiError"]
        execution_metadata = status_defs["GenerationExecutionMetadata"]
        self.assertEqual(
            set(api_error["required"]),
            {"code", "message", "field", "trace_id"},
        )
        self.assertEqual(
            set(status_response["required"]),
            {"generation_id", "status", "result", "errors", "metadata"},
        )
        self.assertEqual(
            set(execution_metadata["required"]),
            {
                "pipeline_preset_id",
                "schema_version",
                "created_at",
                "started_at",
                "completed_at",
                "steps",
                "metrics",
            },
        )
        step_summary = status_defs["GenerationStepSummary"]
        metrics = status_defs["GenerationExecutionMetrics"]
        self.assertEqual(
            set(step_summary["required"]),
            {
                "name",
                "status",
                "attempt_count",
                "agent_name",
                "model",
                "prompt_version",
                "tokens_in",
                "tokens_out",
                "latency_ms",
                "cost_usd",
                "repair_attempts",
                "trace_id",
            },
        )
        self.assertEqual(
            set(metrics["required"]),
            {
                "total_tokens_in",
                "total_tokens_out",
                "total_latency_ms",
                "total_cost_usd",
                "total_repair_attempts",
                "completed_steps",
                "failed_steps",
            },
        )
        self.assertEqual(
            execution_metadata["properties"]["created_at"]["format"],
            "date-time",
        )


if __name__ == "__main__":
    unittest.main()
