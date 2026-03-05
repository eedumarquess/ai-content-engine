import asyncio
import json
from pathlib import Path
from typing import Any

import aio_pika
import httpx
from psycopg import AsyncConnection

from shared.bootstrap.config import Settings, get_settings


def resolve_queue_name(settings: Settings, agent_name: str) -> str:
    if agent_name == "content":
        return settings.content_rpc_queue
    if agent_name == "review":
        return settings.review_rpc_queue
    raise ValueError(f"Unsupported agent name: {agent_name}")


async def check_postgres(settings: Settings) -> None:
    connection = await AsyncConnection.connect(settings.database_url)
    try:
        async with connection.cursor() as cursor:
            await cursor.execute("SELECT 1")
            await cursor.fetchone()
    finally:
        await connection.close()


async def check_rabbitmq(settings: Settings, queue_name: str) -> None:
    connection = await aio_pika.connect_robust(settings.amqp_url)
    try:
        channel = await connection.channel()
        await channel.declare_queue(queue_name, durable=True)
        await channel.declare_queue(settings.step_dlq_queue, durable=True)
        await channel.close()
    finally:
        await connection.close()


async def fetch_ollama_tags(settings: Settings) -> set[str]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.ollama_base_url}/api/tags")
        response.raise_for_status()
        payload = response.json()

    models: list[dict[str, Any]] = payload.get("models", [])
    names = []
    for model in models:
        name = model.get("name") or model.get("model")
        if name:
            names.append(name)
    return set(names)


async def check_ollama(settings: Settings) -> None:
    tags = await fetch_ollama_tags(settings)
    required = {
        settings.ollama_main_model,
        settings.ollama_repair_model,
        settings.ollama_embed_model,
    }
    missing = sorted(
        model_name
        for model_name in required
        if not is_model_available(model_name, tags)
    )
    if missing:
        raise RuntimeError(f"Missing Ollama models: {', '.join(missing)}")


def ensure_cache_dir(settings: Settings) -> None:
    cache_dir = Path(settings.hf_home)
    cache_dir.mkdir(parents=True, exist_ok=True)


def is_model_available(model_name: str, tags: set[str]) -> bool:
    aliases = {model_name}
    if ":" not in model_name:
        aliases.add(f"{model_name}:latest")
    if model_name.endswith(":latest"):
        aliases.add(model_name[: -len(":latest")])
    return any(alias in tags for alias in aliases)


async def run_dependency_checks(agent_name: str) -> None:
    settings = get_settings()
    queue_name = resolve_queue_name(settings, agent_name)

    ensure_cache_dir(settings)
    await check_postgres(settings)
    await check_rabbitmq(settings, queue_name)
    await check_ollama(settings)


def log_event(agent_name: str, event: str, **details: Any) -> None:
    payload = {"agent": agent_name, "event": event, **details}
    print(json.dumps(payload, sort_keys=True), flush=True)


async def idle_loop(agent_name: str) -> None:
    settings = get_settings()
    while True:
        log_event(
            agent_name,
            "heartbeat",
            queue=resolve_queue_name(settings, agent_name),
            ollama=settings.ollama_base_url,
        )
        await asyncio.sleep(settings.heartbeat_interval_seconds)
