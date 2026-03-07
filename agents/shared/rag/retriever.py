from __future__ import annotations

from collections.abc import Sequence
from typing import Any

try:
    from psycopg import AsyncConnection
    from psycopg.rows import dict_row
except ModuleNotFoundError:  # pragma: no cover - exercised only in thin environments
    AsyncConnection = None
    dict_row = None

from shared.schemas import RetrievalFilters, RetrievedDocument

from .embedder import OllamaEmbedder


def format_pgvector(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{float(value):.12g}" for value in values) + "]"


def build_retrieval_filters_sql(filters: RetrievalFilters) -> tuple[str, list[Any]]:
    clauses = ["doc_type = ANY(%s::text[])"]
    params: list[Any] = [filters.doc_types]

    if filters.platform is None:
        clauses.append("platform IS NULL")
    else:
        clauses.append("(platform IS NULL OR platform = %s)")
        params.append(filters.platform)

    if filters.user_id is None:
        clauses.append("user_id IS NULL")
    else:
        clauses.append("(user_id IS NULL OR user_id = %s::uuid)")
        params.append(filters.user_id)

    if filters.tags:
        clauses.append("tags && %s::text[]")
        params.append(filters.tags)

    return " AND ".join(clauses), params


class PgVectorRetriever:
    def __init__(
        self,
        *,
        database_url: str,
        embedder: OllamaEmbedder,
        default_top_k: int = 20,
    ) -> None:
        self.database_url = database_url
        self.embedder = embedder
        self.default_top_k = default_top_k

    async def retrieve(
        self,
        query: str,
        *,
        filters: RetrievalFilters | None = None,
        top_k: int | None = None,
    ) -> list[RetrievedDocument]:
        embedding = await self.embedder.embed_query(query)
        return await self.retrieve_by_embedding(
            embedding,
            filters=filters,
            top_k=top_k,
        )

    async def retrieve_by_embedding(
        self,
        embedding: Sequence[float],
        *,
        filters: RetrievalFilters | None = None,
        top_k: int | None = None,
    ) -> list[RetrievedDocument]:
        if AsyncConnection is None or dict_row is None:
            raise RuntimeError("psycopg is required to use PgVectorRetriever.")

        normalized_filters = filters or RetrievalFilters()
        limit = top_k or self.default_top_k
        where_sql, where_params = build_retrieval_filters_sql(normalized_filters)
        vector = format_pgvector(embedding)

        sql = f"""
            SELECT
                id,
                user_id,
                doc_type,
                platform,
                structure,
                tags,
                source,
                content,
                metadata,
                created_at,
                1 - (embedding <=> %s::vector) AS score
            FROM rag_documents
            WHERE {where_sql}
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        params = [vector, *where_params, vector, limit]

        connection = await AsyncConnection.connect(self.database_url)
        try:
            async with connection.cursor(row_factory=dict_row) as cursor:
                await cursor.execute(sql, params)
                rows = await cursor.fetchall()
        finally:
            await connection.close()

        return [
            RetrievedDocument.model_validate(
                {
                    **row,
                    "score": float(row.get("score") or 0.0),
                }
            )
            for row in rows
        ]
