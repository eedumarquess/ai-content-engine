import asyncio

from shared.bootstrap.dependencies import idle_loop, log_event, run_dependency_checks


async def run() -> None:
    agent_name = "content"
    await run_dependency_checks(agent_name)
    log_event(agent_name, "worker_ready")
    await idle_loop(agent_name)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

