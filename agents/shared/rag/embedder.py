from __future__ import annotations

from typing import Any, Literal, Sequence

import httpx
from pydantic import Field

from shared.schemas import RequiredString, SharedModel


class EmbeddingResult(SharedModel):
    provider: Literal["ollama"] = "ollama"
    model: RequiredString
    embeddings: list[list[float]]
    total_duration_ms: int = Field(default=0, ge=0)


def _nanoseconds_to_milliseconds(value: Any) -> int:
    if isinstance(value, int) and value >= 0:
        return value // 1_000_000
    return 0


class OllamaEmbedder:
    def __init__(
        self,
        *,
        base_url: str,
        model: str = "nomic-embed-text",
        timeout: float = 60.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
        )

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def embed_query(self, text: str) -> list[float]:
        result = await self.embed_documents([text])
        return result.embeddings[0]

    async def embed_documents(self, texts: Sequence[str]) -> EmbeddingResult:
        payload = {
            "model": self.model,
            "input": list(texts),
        }
        response = await self._client.post("/api/embed", json=payload)
        if response.status_code == 404 and len(texts) == 1:
            return await self._embed_single_legacy(texts[0])

        response.raise_for_status()
        body = response.json()
        embeddings = body.get("embeddings")
        if not isinstance(embeddings, list):
            raise ValueError("Ollama embed response did not include embeddings.")

        return EmbeddingResult(
            model=body.get("model") or self.model,
            embeddings=[[float(value) for value in row] for row in embeddings],
            total_duration_ms=_nanoseconds_to_milliseconds(body.get("total_duration")),
        )

    async def _embed_single_legacy(self, text: str) -> EmbeddingResult:
        response = await self._client.post(
            "/api/embeddings",
            json={"model": self.model, "prompt": text},
        )
        response.raise_for_status()
        body = response.json()
        embedding = body.get("embedding")
        if not isinstance(embedding, list):
            raise ValueError("Legacy Ollama embeddings response did not include embedding.")

        return EmbeddingResult(
            model=body.get("model") or self.model,
            embeddings=[[float(value) for value in embedding]],
            total_duration_ms=_nanoseconds_to_milliseconds(body.get("total_duration")),
        )
