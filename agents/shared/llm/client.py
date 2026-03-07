from __future__ import annotations

from typing import Any, Literal

import httpx
from pydantic import Field

from shared.schemas import JsonDict, RequiredString, SharedModel


class OllamaGenerationOptions(SharedModel):
    temperature: float | None = Field(default=None, ge=0)
    top_p: float | None = Field(default=None, ge=0, le=1)
    num_ctx: int | None = Field(default=None, ge=1)
    num_predict: int | None = Field(default=None, ge=1)
    seed: int | None = None


class LlmGenerationResult(SharedModel):
    provider: Literal["ollama"] = "ollama"
    model: RequiredString
    text: str
    done: bool = True
    done_reason: str | None = None
    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    total_duration_ms: int = Field(default=0, ge=0)
    load_duration_ms: int = Field(default=0, ge=0)
    prompt_eval_duration_ms: int = Field(default=0, ge=0)
    eval_duration_ms: int = Field(default=0, ge=0)
    raw_response: JsonDict = Field(default_factory=dict)


def _nanoseconds_to_milliseconds(value: Any) -> int:
    if isinstance(value, int) and value >= 0:
        return value // 1_000_000
    return 0


class OllamaClient:
    def __init__(
        self,
        *,
        base_url: str,
        main_model: str = "qwen2.5:7b",
        repair_model: str = "qwen2.5:3b",
        timeout: float = 120.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.main_model = main_model
        self.repair_model = repair_model
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
        )

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def generate(
        self,
        prompt: str,
        *,
        model: str | None = None,
        system: str | None = None,
        response_format: str | JsonDict | None = None,
        options: OllamaGenerationOptions | None = None,
        keep_alive: str | None = None,
    ) -> LlmGenerationResult:
        payload: dict[str, Any] = {
            "model": model or self.main_model,
            "prompt": prompt,
            "stream": False,
        }
        if system is not None:
            payload["system"] = system
        if response_format is not None:
            payload["format"] = response_format
        if options is not None:
            payload["options"] = options.model_dump(exclude_none=True)
        if keep_alive is not None:
            payload["keep_alive"] = keep_alive

        response = await self._client.post("/api/generate", json=payload)
        response.raise_for_status()
        body = response.json()

        return LlmGenerationResult(
            model=body.get("model") or payload["model"],
            text=body.get("response", ""),
            done=bool(body.get("done", True)),
            done_reason=body.get("done_reason"),
            prompt_tokens=body.get("prompt_eval_count") or 0,
            completion_tokens=body.get("eval_count") or 0,
            total_duration_ms=_nanoseconds_to_milliseconds(body.get("total_duration")),
            load_duration_ms=_nanoseconds_to_milliseconds(body.get("load_duration")),
            prompt_eval_duration_ms=_nanoseconds_to_milliseconds(
                body.get("prompt_eval_duration")
            ),
            eval_duration_ms=_nanoseconds_to_milliseconds(body.get("eval_duration")),
            raw_response=body,
        )

    async def generate_main(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | JsonDict | None = None,
        options: OllamaGenerationOptions | None = None,
    ) -> LlmGenerationResult:
        return await self.generate(
            prompt,
            model=self.main_model,
            system=system,
            response_format=response_format,
            options=options,
        )

    async def generate_repair(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | JsonDict | None = "json",
        options: OllamaGenerationOptions | None = None,
    ) -> LlmGenerationResult:
        return await self.generate(
            prompt,
            model=self.repair_model,
            system=system,
            response_format=response_format,
            options=options,
        )
