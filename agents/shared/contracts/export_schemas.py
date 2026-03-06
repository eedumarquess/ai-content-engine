from __future__ import annotations

import json

from .generation_v1 import build_schema_documents, get_schema_output_dir


def export_schemas() -> None:
    output_dir = get_schema_output_dir()
    output_dir.mkdir(parents=True, exist_ok=True)

    for filename, schema in build_schema_documents().items():
        target = output_dir / filename
        target.write_text(
            json.dumps(schema, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    export_schemas()
