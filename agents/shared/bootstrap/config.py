from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(alias="DATABASE_URL")
    amqp_url: str = Field(alias="AMQP_URL")
    ollama_base_url: str = Field(alias="OLLAMA_BASE_URL")
    ollama_main_model: str = Field(alias="OLLAMA_MAIN_MODEL")
    ollama_repair_model: str = Field(alias="OLLAMA_REPAIR_MODEL")
    ollama_embed_model: str = Field(alias="OLLAMA_EMBED_MODEL")
    content_rpc_queue: str = Field(alias="CONTENT_RPC_QUEUE")
    review_rpc_queue: str = Field(alias="REVIEW_RPC_QUEUE")
    step_dlq_queue: str = Field(alias="STEP_DLQ_QUEUE")
    reranker_model: str = Field(alias="RERANKER_MODEL")
    hf_home: str = Field(default="/data/hf", alias="HF_HOME")
    transformers_cache: str = Field(
        default="/data/hf",
        alias="TRANSFORMERS_CACHE",
    )
    heartbeat_interval_seconds: int = Field(
        default=30,
        alias="HEARTBEAT_INTERVAL_SECONDS",
    )
    agent_name: str | None = Field(default=None, alias="AGENT_NAME")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

