import argparse
import asyncio
import sys

from shared.bootstrap.dependencies import log_event, run_dependency_checks


async def run(agent_name: str) -> int:
    try:
        await run_dependency_checks(agent_name)
    except Exception as error:
        log_event(agent_name, "healthcheck_failed", error=str(error))
        return 1

    log_event(agent_name, "healthcheck_ok")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", required=True, choices=["content", "review"])
    args = parser.parse_args()

    exit_code = asyncio.run(run(args.agent))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

