from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from shared.llm import LlmGenerationResult
from shared.prompts import PromptLoader

SchemaModelT = TypeVar("SchemaModelT", bound=BaseModel)


class RepairLlmClient(Protocol):
    async def generate_repair(
        self,
        prompt: str,
        *,
        system: str | None = None,
        response_format: str | dict[str, Any] | None = "json",
    ) -> LlmGenerationResult: ...


@dataclass(slots=True)
class ValidationAttempt:
    raw_text: str
    parsed_json: dict[str, Any] | None
    model: BaseModel | None
    errors: list[dict[str, Any]] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return self.model is not None and not self.errors


@dataclass(slots=True)
class RepairOutcome:
    model: BaseModel
    output_json: dict[str, Any]
    raw_text: str
    repair_attempts: int
    repaired: bool
    llm_response: LlmGenerationResult | None = None


class RepairExhaustedError(RuntimeError):
    def __init__(
        self,
        *,
        raw_output: str,
        errors: list[dict[str, Any]],
        attempts: int,
    ) -> None:
        super().__init__("Repair attempts exhausted.")
        self.raw_output = raw_output
        self.errors = errors
        self.attempts = attempts


class RepairService:
    def __init__(
        self,
        *,
        llm_client: RepairLlmClient,
        prompt_loader: PromptLoader | None = None,
        prompt_version: str = "repair_v1",
        max_attempts: int = 3,
        system_prompt: str | None = None,
    ) -> None:
        self.llm_client = llm_client
        self.prompt_loader = prompt_loader or PromptLoader()
        self.prompt_version = prompt_version
        self.max_attempts = max_attempts
        self.system_prompt = system_prompt

    async def ensure_valid(
        self,
        raw_output: str | dict[str, Any] | BaseModel,
        schema_model: type[SchemaModelT],
        *,
        context: dict[str, Any] | None = None,
    ) -> RepairOutcome:
        initial_attempt = validate_output(raw_output, schema_model)
        if initial_attempt.is_valid:
            model = initial_attempt.model
            assert model is not None
            return RepairOutcome(
                model=model,
                output_json=model.model_dump(mode="json"),
                raw_text=initial_attempt.raw_text,
                repair_attempts=0,
                repaired=False,
            )

        latest_raw_text = initial_attempt.raw_text
        latest_errors = initial_attempt.errors
        repair_response: LlmGenerationResult | None = None

        for attempt_number in range(1, self.max_attempts + 1):
            prompt = self.prompt_loader.render(
                "repair",
                self.prompt_version,
                raw_output=latest_raw_text,
                validation_errors_json=json.dumps(
                    latest_errors,
                    ensure_ascii=True,
                    indent=2,
                    sort_keys=True,
                ),
                expected_schema_json=json.dumps(
                    schema_model.model_json_schema(),
                    ensure_ascii=True,
                    indent=2,
                    sort_keys=True,
                ),
                context_json=json.dumps(
                    context or {},
                    ensure_ascii=True,
                    indent=2,
                    sort_keys=True,
                ),
            )
            repair_response = await self.llm_client.generate_repair(
                prompt,
                system=self.system_prompt,
                response_format="json",
            )

            repaired_attempt = validate_output(repair_response.text, schema_model)
            if repaired_attempt.is_valid:
                model = repaired_attempt.model
                assert model is not None
                return RepairOutcome(
                    model=model,
                    output_json=model.model_dump(mode="json"),
                    raw_text=repaired_attempt.raw_text,
                    repair_attempts=attempt_number,
                    repaired=True,
                    llm_response=repair_response,
                )

            latest_raw_text = repaired_attempt.raw_text
            latest_errors = repaired_attempt.errors

        raise RepairExhaustedError(
            raw_output=latest_raw_text,
            errors=latest_errors,
            attempts=self.max_attempts,
        )


def validate_output(
    raw_output: str | dict[str, Any] | BaseModel,
    schema_model: type[SchemaModelT],
) -> ValidationAttempt:
    raw_text = (
        raw_output
        if isinstance(raw_output, str)
        else json.dumps(
            raw_output.model_dump(mode="json")
            if isinstance(raw_output, BaseModel)
            else raw_output,
            ensure_ascii=True,
            sort_keys=True,
        )
    )

    try:
        parsed_json = parse_json_payload(raw_output)
    except ValueError as error:
        return ValidationAttempt(
            raw_text=raw_text,
            parsed_json=None,
            model=None,
            errors=[
                {
                    "type": "json_invalid",
                    "loc": [],
                    "msg": str(error),
                    "input": raw_text,
                }
            ],
        )

    try:
        model = schema_model.model_validate(parsed_json)
    except ValidationError as error:
        return ValidationAttempt(
            raw_text=raw_text,
            parsed_json=parsed_json,
            model=None,
            errors=error.errors(),
        )

    return ValidationAttempt(
        raw_text=raw_text,
        parsed_json=parsed_json,
        model=model,
    )


def parse_json_payload(raw_output: str | dict[str, Any] | BaseModel) -> dict[str, Any]:
    if isinstance(raw_output, BaseModel):
        return raw_output.model_dump(mode="json")

    if isinstance(raw_output, dict):
        return raw_output

    normalized = strip_markdown_fences(raw_output.strip())
    for candidate in (normalized, extract_braced_json(normalized)):
        if not candidate:
            continue
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload

    raise ValueError("Could not parse a JSON object from the model output.")


def strip_markdown_fences(value: str) -> str:
    if not value.startswith("```"):
        return value

    lines = value.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return value


def extract_braced_json(value: str) -> str | None:
    start = value.find("{")
    end = value.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return value[start : end + 1]
