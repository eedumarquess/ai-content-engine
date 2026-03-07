from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Protocol

try:
    from psycopg import AsyncConnection
    from psycopg.rows import dict_row
except ModuleNotFoundError:  # pragma: no cover - exercised only in thin environments
    AsyncConnection = None
    dict_row = None

from shared.llm import ModelPricing, estimate_cost_usd
from shared.schemas import (
    GenerationCostSnapshot,
    LlmTraceRecord,
    RetrievedDocument,
    RetrievedDocumentPreview,
)


class TraceConnectionFactory(Protocol):
    async def __call__(self) -> AsyncConnection: ...


def build_retrieved_docs_preview(
    documents: Sequence[RetrievedDocument],
    *,
    max_chars: int = 240,
) -> list[RetrievedDocumentPreview]:
    previews: list[RetrievedDocumentPreview] = []
    for document in documents:
        content = document.content.strip()
        preview = content if len(content) <= max_chars else content[: max_chars - 3] + "..."
        previews.append(
            RetrievedDocumentPreview(
                id=document.id,
                doc_type=document.doc_type,
                platform=document.platform,
                score=document.score,
                content_preview=preview,
                tags=document.tags,
            )
        )
    return previews


class TraceWriter:
    def __init__(
        self,
        *,
        database_url: str,
        pricing_table: Mapping[str, Mapping[str, ModelPricing]] | None = None,
        connection_factory: TraceConnectionFactory | None = None,
    ) -> None:
        self.database_url = database_url
        self.pricing_table = pricing_table
        self.connection_factory = connection_factory

    async def write(self, trace: LlmTraceRecord) -> tuple[LlmTraceRecord, GenerationCostSnapshot]:
        if AsyncConnection is None or dict_row is None:
            raise RuntimeError("psycopg is required to use TraceWriter.")

        normalized_trace = self._normalize_trace(trace)
        connection = await self._connect()
        try:
            async with connection.transaction():
                async with connection.cursor(row_factory=dict_row) as cursor:
                    payload = normalized_trace.model_dump(mode="json")
                    await cursor.execute(
                        """
                        INSERT INTO llm_traces (
                            generation_id,
                            step_name,
                            agent_name,
                            provider,
                            model,
                            prompt_version,
                            prompt_text,
                            retrieved_doc_ids,
                            retrieved_docs_preview,
                            tokens_in,
                            tokens_out,
                            latency_ms,
                            cost_usd,
                            output_json,
                            error_json,
                            otel_trace_id,
                            otel_span_id,
                            created_at
                        ) VALUES (
                            %(generation_id)s,
                            %(step_name)s,
                            %(agent_name)s,
                            %(provider)s,
                            %(model)s,
                            %(prompt_version)s,
                            %(prompt_text)s,
                            %(retrieved_doc_ids)s,
                            %(retrieved_docs_preview)s,
                            %(tokens_in)s,
                            %(tokens_out)s,
                            %(latency_ms)s,
                            %(cost_usd)s,
                            %(output_json)s,
                            %(error_json)s,
                            %(otel_trace_id)s,
                            %(otel_span_id)s,
                            %(created_at)s
                        )
                        """,
                        payload,
                    )
                    await cursor.execute(
                        """
                        INSERT INTO generation_costs (
                            generation_id,
                            total_tokens_in,
                            total_tokens_out,
                            total_cost_usd,
                            updated_at
                        ) VALUES (
                            %(generation_id)s,
                            %(tokens_in)s,
                            %(tokens_out)s,
                            %(cost_usd)s,
                            now()
                        )
                        ON CONFLICT (generation_id) DO UPDATE
                        SET total_tokens_in = generation_costs.total_tokens_in + EXCLUDED.total_tokens_in,
                            total_tokens_out = generation_costs.total_tokens_out + EXCLUDED.total_tokens_out,
                            total_cost_usd = generation_costs.total_cost_usd + EXCLUDED.total_cost_usd,
                            updated_at = now()
                        RETURNING generation_id, total_tokens_in, total_tokens_out, total_cost_usd
                        """,
                        payload,
                    )
                    row = await cursor.fetchone()
        finally:
            await connection.close()

        snapshot = GenerationCostSnapshot.model_validate(row)
        return normalized_trace, snapshot

    async def _connect(self) -> AsyncConnection:
        if AsyncConnection is None:
            raise RuntimeError("psycopg is required to use TraceWriter.")
        if self.connection_factory is not None:
            return await self.connection_factory()
        return await AsyncConnection.connect(self.database_url)

    def _normalize_trace(self, trace: LlmTraceRecord) -> LlmTraceRecord:
        if trace.cost_usd > Decimal("0"):
            return trace

        estimated_cost = estimate_cost_usd(
            trace.provider,
            trace.model,
            tokens_in=trace.tokens_in,
            tokens_out=trace.tokens_out,
            pricing_table=self.pricing_table,
        )
        return trace.model_copy(update={"cost_usd": estimated_cost})
