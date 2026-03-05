#!/bin/sh
set -eu

echo "Waiting for Ollama server..."
until ollama list >/dev/null 2>&1; do
  sleep 2
done

echo "Pulling main model: ${OLLAMA_MAIN_MODEL}"
ollama pull "${OLLAMA_MAIN_MODEL}"

echo "Pulling repair model: ${OLLAMA_REPAIR_MODEL}"
ollama pull "${OLLAMA_REPAIR_MODEL}"

echo "Pulling embedding model: ${OLLAMA_EMBED_MODEL}"
ollama pull "${OLLAMA_EMBED_MODEL}"

echo "Ollama models are ready."

