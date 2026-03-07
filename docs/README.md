# Documentacao

Este diretorio centraliza a documentacao do projeto e o historico da implementacao das partes do MVP.

## Indice

- [Implementacao da Parte 1](./parte-1-alteracoes.md)
- [Implementacao da Parte 2](./parte-2-alteracoes.md)
- [Implementacao da Parte 3](./parte-3-alteracoes.md)
- [Implementacao da Parte 4](./parte-4-alteracoes.md)
- [Implementacao da Parte 5](./parte-5-alteracoes.md)
- [Implementacao da Parte 6](./parte-6-alteracoes.md)
- [Implementacao da Parte 7](./parte-7-alteracoes.md)
- [Implementacao da Parte 8](./parte-8-alteracoes.md)
- [Implementacao da Parte 9](./parte-9-alteracoes.md)
- [Implementacao da Parte 10](./parte-10-alteracoes.md)
- [Implementacao da Parte 11](./parte-11-alteracoes.md)
- [Implementacao da Parte 12](./parte-12-alteracoes.md)
- [Infra local e operacao](./infra-local.md)
- [Plano de acao do MVP](./plano-de-acao-mvp.md)
- [Questionario de decisoes do MVP](./questionario-decisoes-mvp.md)
- [Build guide completo](./ai-content-engine-steps.md)

## Resumo rapido

Nesta etapa, o projeto ja conta com a fundacao operacional e de persistencia do MVP:

- `docker-compose` para Postgres, RabbitMQ, Ollama, orchestrator NestJS e workers Python
- bootstrap one-shot dos modelos `qwen2.5:7b`, `qwen2.5:3b` e `nomic-embed-text`
- bootstrap one-shot de banco com migrations, seed e verify
- schema inicial do MVP com `users`, `pipeline_presets`, `generations`, `generation_steps`, `rag_documents`, `llm_traces`, `generation_costs` e `performance_events`
- preset global `content_review_v1` com UUID fixo e carregamento por usuario
- seed de `persona` e `knowledge` com embeddings reais via Ollama
- healthchecks reais para banco, broker, modelos e filas
- orchestrator com dispatcher assincrono, executor sequencial, retry, DLQ e recovery no startup
- workers com bootstrap compartilhado, validacao de dependencias e heartbeat
- shared layer Python com cliente Ollama, retrieval, reranker, prompt loader, repair, tracing e worker base
- `content_agent` e `review_agent` operacionais com retrieval, rerank, repair e tracing
- endpoint `POST /performance-events` com persistencia e validacao estruturada
- telemetria por step exposta em `GET /generations/:id`
- teste integrado cobrindo o fluxo principal do MVP
- cache opcional do reranker `BAAI/bge-reranker-base`

## Convencoes

- A documentacao operacional fica em `docs/infra-local.md`
- A documentacao de implementacao fica em `docs/parte-1-alteracoes.md`
- A implementacao da persistencia base fica em `docs/parte-2-alteracoes.md`
- A implementacao do contrato global e endpoints do MVP fica em `docs/parte-3-alteracoes.md`
- A implementacao do orchestrator NestJS fica em `docs/parte-4-alteracoes.md`
- A implementacao da shared layer dos agents Python fica em `docs/parte-5-alteracoes.md`
- A implementacao do `content_agent` fica em `docs/parte-6-alteracoes.md`
- A implementacao do `review_agent` fica em `docs/parte-7-alteracoes.md`
- A implementacao da ingestao de `performance_memory` fica em `docs/parte-8-alteracoes.md`
- A implementacao do prompt versioning fica em `docs/parte-9-alteracoes.md`
- A implementacao do repair loop fica em `docs/parte-10-alteracoes.md`
- A implementacao de tracing, custo e readiness para OpenTelemetry fica em `docs/parte-11-alteracoes.md`
- A validacao ponta a ponta do MVP fica em `docs/parte-12-alteracoes.md`
- Os documentos de produto e arquitetura que antes estavam na raiz agora ficam todos dentro de `docs/`
