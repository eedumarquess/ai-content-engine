from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Mapping

from pydantic import Field

from shared.schemas import RequiredString, SharedModel


class ModelPricing(SharedModel):
    input_per_1k: Decimal = Field(default=Decimal("0"), ge=0)
    output_per_1k: Decimal = Field(default=Decimal("0"), ge=0)


DEFAULT_PRICING_TABLE: dict[str, dict[str, ModelPricing]] = {
    "ollama": {
        "qwen2.5:7b": ModelPricing(),
        "qwen2.5:3b": ModelPricing(),
        "nomic-embed-text": ModelPricing(),
    }
}


def normalize_model_aliases(model: RequiredString) -> set[str]:
    aliases = {model}
    if ":" not in model:
        aliases.add(f"{model}:latest")
    if model.endswith(":latest"):
        aliases.add(model[: -len(":latest")])
    return aliases


def resolve_pricing(
    provider: RequiredString,
    model: RequiredString,
    pricing_table: Mapping[str, Mapping[str, ModelPricing]] | None = None,
) -> ModelPricing:
    table = pricing_table or DEFAULT_PRICING_TABLE
    provider_table = table.get(provider, {})

    for alias in normalize_model_aliases(model):
        if alias in provider_table:
            return provider_table[alias]

    return ModelPricing()


def estimate_cost_usd(
    provider: RequiredString,
    model: RequiredString,
    *,
    tokens_in: int,
    tokens_out: int,
    pricing_table: Mapping[str, Mapping[str, ModelPricing]] | None = None,
) -> Decimal:
    price = resolve_pricing(provider, model, pricing_table)
    input_cost = (Decimal(tokens_in) / Decimal("1000")) * price.input_per_1k
    output_cost = (Decimal(tokens_out) / Decimal("1000")) * price.output_per_1k
    return (input_cost + output_cost).quantize(
        Decimal("0.000001"),
        rounding=ROUND_HALF_UP,
    )
