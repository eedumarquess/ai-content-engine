# Documentacao

Este diretorio centraliza a documentacao do projeto e o historico da implementacao das partes do MVP.

## Indice

- [Implementacao da Parte 1](./parte-1-alteracoes.md)
- [Implementacao da Parte 2](./parte-2-alteracoes.md)
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
- workers com bootstrap compartilhado, validacao de dependencias e heartbeat
- cache opcional do reranker `BAAI/bge-reranker-base`

## Convencoes

- A documentacao operacional fica em `docs/infra-local.md`
- A documentacao de implementacao fica em `docs/parte-1-alteracoes.md`
- A implementacao da persistencia base fica em `docs/parte-2-alteracoes.md`
- Os documentos de produto e arquitetura que antes estavam na raiz agora ficam todos dentro de `docs/`
