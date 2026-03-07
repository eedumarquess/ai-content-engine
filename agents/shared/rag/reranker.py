from __future__ import annotations

import asyncio
import threading
from collections.abc import Sequence

from sentence_transformers import CrossEncoder

from shared.schemas import RerankedDocument, RetrievedDocument


class LocalReranker:
    def __init__(
        self,
        *,
        model_name: str = "BAAI/bge-reranker-base",
        batch_size: int = 8,
        cross_encoder: CrossEncoder | None = None,
    ) -> None:
        self.model_name = model_name
        self.batch_size = batch_size
        self._cross_encoder = cross_encoder
        self._load_lock = threading.Lock()

    async def rerank(
        self,
        query: str,
        documents: Sequence[RetrievedDocument],
        *,
        top_k: int = 5,
    ) -> list[RerankedDocument]:
        if not documents:
            return []

        model = await asyncio.to_thread(self._get_model)
        pairs = [(query, document.content) for document in documents]
        raw_scores = await asyncio.to_thread(
            model.predict,
            pairs,
            batch_size=self.batch_size,
            show_progress_bar=False,
        )

        reranked = [
            RerankedDocument(
                **document.model_dump(mode="python"),
                rerank_score=float(score),
            )
            for document, score in zip(documents, raw_scores, strict=True)
        ]
        reranked.sort(key=lambda document: document.rerank_score, reverse=True)
        return reranked[: max(top_k, 0)]

    def _get_model(self) -> CrossEncoder:
        if self._cross_encoder is not None:
            return self._cross_encoder

        with self._load_lock:
            if self._cross_encoder is None:
                self._cross_encoder = CrossEncoder(
                    self.model_name,
                    trust_remote_code=False,
                )
        return self._cross_encoder
