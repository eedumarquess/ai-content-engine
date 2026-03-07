from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Protocol

try:
    import aio_pika
except ModuleNotFoundError:  # pragma: no cover - exercised only in thin environments
    aio_pika = None
from pydantic import ValidationError

from shared.contracts import ApiError, ApiErrorResponse
from shared.schemas import (
    StepRpcFailureReply,
    StepRpcRequest,
    StepRpcSuccessReply,
    WorkerReplyMetadata,
)


class StepHandler(Protocol):
    agent_name: str

    async def handle(self, request: StepRpcRequest) -> "WorkerExecutionResult": ...


@dataclass(slots=True)
class WorkerExecutionResult:
    output_json: dict[str, Any] | None
    reply_metadata: WorkerReplyMetadata
    error_json: ApiErrorResponse | None = None

    @classmethod
    def success(
        cls,
        *,
        output_json: dict[str, Any],
        reply_metadata: WorkerReplyMetadata | None = None,
    ) -> "WorkerExecutionResult":
        return cls(
            output_json=output_json,
            reply_metadata=reply_metadata or WorkerReplyMetadata(),
        )

    @classmethod
    def failure(
        cls,
        *,
        error_json: ApiErrorResponse,
        output_json: dict[str, Any] | None = None,
        reply_metadata: WorkerReplyMetadata | None = None,
    ) -> "WorkerExecutionResult":
        return cls(
            output_json=output_json,
            reply_metadata=reply_metadata or WorkerReplyMetadata(),
            error_json=error_json,
        )

    def to_wire_payload(self) -> dict[str, Any]:
        if self.error_json is None:
            return StepRpcSuccessReply(
                output_json=self.output_json or {},
                reply_metadata=self.reply_metadata,
            ).model_dump(mode="json")

        return StepRpcFailureReply(
            error_json=self.error_json,
            output_json=self.output_json,
            reply_metadata=self.reply_metadata,
        ).model_dump(mode="json")


class RabbitRpcWorker:
    def __init__(
        self,
        *,
        amqp_url: str,
        queue_name: str,
        handler: StepHandler,
        prefetch_count: int = 1,
    ) -> None:
        if aio_pika is None:
            raise RuntimeError("aio-pika is required to use RabbitRpcWorker.")
        self.amqp_url = amqp_url
        self.queue_name = queue_name
        self.handler = handler
        self.prefetch_count = prefetch_count
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.abc.AbstractRobustChannel | None = None
        self._stopped = asyncio.Event()

    async def close(self) -> None:
        self._stopped.set()
        if self._channel is not None:
            await self._channel.close()
            self._channel = None
        if self._connection is not None:
            await self._connection.close()
            self._connection = None

    async def run_forever(self) -> None:
        self._connection = await aio_pika.connect_robust(self.amqp_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=self.prefetch_count)

        queue = await self._channel.declare_queue(self.queue_name, durable=True)
        await queue.consume(self._on_message, no_ack=False)

        try:
            await self._stopped.wait()
        finally:
            await self.close()

    async def _on_message(self, message: aio_pika.IncomingMessage) -> None:
        if message.reply_to is None or message.correlation_id is None:
            await message.reject(requeue=False)
            return

        try:
            request = StepRpcRequest.model_validate_json(message.body)
        except ValidationError:
            result = self._build_invalid_request_result(message.correlation_id)
            await self._publish_reply(message, result)
            await message.ack()
            return

        try:
            result = await self.handler.handle(request)
        except Exception as error:
            result = self._build_internal_error_result(
                correlation_id=message.correlation_id,
                model=request.config.model,
                prompt_version=request.prompt_version,
                error=error,
            )

        await self._publish_reply(message, result)
        await message.ack()

    async def _publish_reply(
        self,
        request_message: aio_pika.IncomingMessage,
        result: WorkerExecutionResult,
    ) -> None:
        if self._channel is None:
            raise RuntimeError("Worker channel is not initialized.")

        await self._channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(result.to_wire_payload()).encode("utf-8"),
                content_type="application/json",
                correlation_id=request_message.correlation_id,
            ),
            routing_key=request_message.reply_to or "",
        )

    def _build_invalid_request_result(self, correlation_id: str) -> WorkerExecutionResult:
        return WorkerExecutionResult.failure(
            error_json=ApiErrorResponse(
                errors=[
                    ApiError(
                        code="validation_error",
                        message="Invalid worker request payload.",
                        field=None,
                        trace_id=correlation_id,
                    )
                ]
            ),
            reply_metadata=WorkerReplyMetadata(
                agent_name=self.handler.agent_name,
                trace_id=correlation_id,
            ),
        )

    def _build_internal_error_result(
        self,
        *,
        correlation_id: str,
        model: str,
        prompt_version: str,
        error: Exception,
    ) -> WorkerExecutionResult:
        return WorkerExecutionResult.failure(
            error_json=ApiErrorResponse(
                errors=[
                    ApiError(
                        code="internal_error",
                        message=str(error) or "Unhandled worker exception.",
                        field=None,
                        trace_id=correlation_id,
                    )
                ]
            ),
            reply_metadata=WorkerReplyMetadata(
                agent_name=self.handler.agent_name,
                provider="ollama",
                model=model,
                prompt_version=prompt_version,
                trace_id=correlation_id,
            ),
        )
