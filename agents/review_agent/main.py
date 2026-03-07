import asyncio

from review_agent.handler import ReviewStepHandler
from shared.bootstrap.config import get_settings
from shared.bootstrap.dependencies import log_event, run_dependency_checks
from shared.llm import OllamaClient
from shared.prompts import PromptLoader
from shared.rag import LocalReranker, OllamaEmbedder, PgVectorRetriever
from shared.rabbit import RabbitRpcWorker
from shared.repair import RepairService
from shared.tracing import TraceWriter


async def run() -> None:
    agent_name = "review"
    await run_dependency_checks(agent_name)
    settings = get_settings()

    embedder = OllamaEmbedder(
        base_url=settings.ollama_base_url,
        model=settings.ollama_embed_model,
    )
    llm_client = OllamaClient(
        base_url=settings.ollama_base_url,
        main_model=settings.ollama_main_model,
        repair_model=settings.ollama_repair_model,
    )
    handler = ReviewStepHandler(
        retriever=PgVectorRetriever(
            database_url=settings.database_url,
            embedder=embedder,
        ),
        reranker=LocalReranker(model_name=settings.reranker_model),
        prompt_loader=PromptLoader(),
        llm_client=llm_client,
        repair_service=RepairService(
            llm_client=llm_client,
            prompt_loader=PromptLoader(),
        ),
        trace_writer=TraceWriter(database_url=settings.database_url),
    )
    worker = RabbitRpcWorker(
        amqp_url=settings.amqp_url,
        queue_name=settings.review_rpc_queue,
        handler=handler,
    )

    log_event(agent_name, "worker_ready", queue=settings.review_rpc_queue)
    try:
        await worker.run_forever()
    finally:
        await llm_client.close()
        await embedder.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
