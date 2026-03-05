import os
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> None:
    model_name = os.environ["RERANKER_MODEL"]
    cache_dir = Path(os.environ.get("HF_HOME", "/data/hf"))
    cache_dir.mkdir(parents=True, exist_ok=True)

    snapshot_download(repo_id=model_name, cache_dir=str(cache_dir))
    print(f"Prefetched reranker model: {model_name}", flush=True)


if __name__ == "__main__":
    main()
