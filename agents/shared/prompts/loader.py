from __future__ import annotations

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from shared.schemas import RequiredString, SharedModel

VERSION_PATTERN = re.compile(r"(?:^|_)v(?P<number>\d+)$")


class LoadedPrompt(SharedModel):
    agent_name: RequiredString
    version: RequiredString
    path: str
    template: str


class PromptLoader:
    def __init__(self, base_dir: str | Path | None = None) -> None:
        self.base_dir = Path(base_dir or Path(__file__).resolve().parents[2] / "prompts")
        self._environment = Environment(
            loader=FileSystemLoader(self.base_dir),
            autoescape=False,
            keep_trailing_newline=True,
            lstrip_blocks=True,
            trim_blocks=True,
            undefined=StrictUndefined,
        )

    def load(self, agent_name: str, version: str) -> LoadedPrompt:
        path = self.resolve_path(agent_name, version)
        template = path.read_text(encoding="utf-8")
        return LoadedPrompt(
            agent_name=agent_name,
            version=path.stem,
            path=str(path),
            template=template,
        )

    def render(self, agent_name: str, version: str, **context: object) -> str:
        path = self.resolve_path(agent_name, version)
        relative_path = path.relative_to(self.base_dir).as_posix()
        template = self._environment.get_template(relative_path)
        return template.render(**context)

    def list_versions(self, agent_name: str) -> list[str]:
        prompt_dir = self.base_dir / agent_name
        if not prompt_dir.exists():
            return []

        versions = [path.stem for path in prompt_dir.glob("*.jinja")]
        return sorted(versions, key=self._version_sort_key)

    def latest_version(self, agent_name: str) -> str:
        versions = self.list_versions(agent_name)
        if not versions:
            raise FileNotFoundError(f"No prompt versions found for {agent_name}.")
        return versions[-1]

    def resolve_path(self, agent_name: str, version: str) -> Path:
        agent_dir = self.base_dir / agent_name
        candidates = self._candidate_names(agent_name, version)

        for candidate in candidates:
            path = agent_dir / candidate
            if path.exists():
                return path

        raise FileNotFoundError(
            f"Prompt {agent_name}/{version} not found under {self.base_dir}."
        )

    def _candidate_names(self, agent_name: str, version: str) -> list[str]:
        normalized = version[:-len(".jinja")] if version.endswith(".jinja") else version
        candidates = [f"{normalized}.jinja"]
        if agent_name == "repair" and not normalized.startswith("repair_"):
            candidates.append(f"repair_{normalized}.jinja")
        return candidates

    @staticmethod
    def _version_sort_key(version: str) -> tuple[int, str]:
        match = VERSION_PATTERN.search(version)
        if match is None:
            return (-1, version)
        return (int(match.group("number")), version)
