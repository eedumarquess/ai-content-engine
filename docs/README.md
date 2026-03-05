# Documentacao

Este diretorio centraliza a documentacao do projeto e o historico da implementacao inicial do ambiente local.

## Indice

- [Implementacao da Parte 1](./parte-1-alteracoes.md)
- [Infra local e operacao](./infra-local.md)
- [Plano de acao do MVP](./plano-de-acao-mvp.md)
- [Questionario de decisoes do MVP](./questionario-decisoes-mvp.md)
- [Build guide completo](./ai-content-engine-steps.md)

## Resumo rapido

Nesta etapa, o projeto passou de documentacao solta para uma base executavel com:

- `docker-compose` para Postgres, RabbitMQ, Ollama, orchestrator NestJS e workers Python
- bootstrap one-shot dos modelos `qwen2.5:7b`, `qwen2.5:3b` e `nomic-embed-text`
- healthchecks reais para banco, broker, modelos e filas
- workers com bootstrap compartilhado, validacao de dependencias e heartbeat
- cache opcional do reranker `BAAI/bge-reranker-base`

## Convencoes

- A documentacao operacional fica em `docs/infra-local.md`
- A documentacao de implementacao fica em `docs/parte-1-alteracoes.md`
- Os documentos de produto e arquitetura que antes estavam na raiz agora ficam todos dentro de `docs/`

