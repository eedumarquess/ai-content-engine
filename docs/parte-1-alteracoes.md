# Parte 1 - Alteracoes implementadas

Este documento registra tudo o que foi implementado na Parte 1 do MVP: infra local, ambiente de execucao, readiness e documentacao operacional.

## 1. Estrutura criada

Foi criada a estrutura base do repositorio para suportar a stack local:

- `docker-compose.yml`
- `docker-compose.gpu.yml`
- `.env.example`
- `docs/infra-local.md`
- `infra/postgres/init/001_extensions.sql`
- `infra/rabbitmq/rabbitmq.conf`
- `infra/ollama/bootstrap/pull-models.sh`
- `infra/reranker/bootstrap/prefetch.py`
- `orchestrator/`
- `agents/`

Tambem foram gerados os lockfiles:

- `orchestrator/pnpm-lock.yaml`
- `agents/uv.lock`

## 2. Infra Docker

O ambiente local passou a subir os seguintes servicos:

- `postgres` com imagem `pgvector/pgvector:pg17`
- `rabbitmq` com imagem `rabbitmq:4.2-management`
- `ollama`
- `ollama-model-init` como bootstrap one-shot
- `orchestrator`
- `content-worker`
- `review-worker`
- `reranker-cache-init` como passo opcional

### Volumes persistentes

- `postgres_data`
- `rabbitmq_data`
- `ollama_data`
- `hf_cache`

### Portas de host configuraveis

As portas publicadas no host passaram a ser configuraveis por ambiente:

- `POSTGRES_HOST_PORT`
- `RABBITMQ_AMQP_HOST_PORT`
- `RABBITMQ_MANAGEMENT_HOST_PORT`
- `OLLAMA_HOST_PORT`
- `ORCHESTRATOR_HOST_PORT`

Observacao: no ambiente local validado nesta maquina, o Postgres ficou em `5433` no host porque `5432` ja estava ocupada.

## 3. Banco e extensoes

O bootstrap do Postgres agora aplica automaticamente:

- `CREATE EXTENSION IF NOT EXISTS vector;`
- `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

Isso garante que o banco ja sobe pronto para `pgvector` e para geracao de UUIDs aleatorios nas proximas partes.

## 4. RabbitMQ e topologia reservada

O orchestrator e os workers passaram a reservar e validar as filas:

- `content.rpc`
- `review.rpc`
- `steps.dlq`

As filas sao declaradas como `durable`, para que a topologia ja nasca previsivel antes da implementacao do pipeline.

## 5. Bootstrap do Ollama

Foi implementado o servico `ollama-model-init`, que:

- espera o `ollama` ficar saudavel
- executa `ollama pull` para `qwen2.5:7b`
- executa `ollama pull` para `qwen2.5:3b`
- executa `ollama pull` para `nomic-embed-text`

O processo e idempotente e reaproveita o volume `ollama_data`, entao um restart posterior nao precisa baixar tudo novamente.

## 6. Orchestrator NestJS

Foi criado um scaffold minimo de NestJS em `orchestrator/` com:

- `ConfigModule` global
- validacao de ambiente com `zod`
- endpoint `GET /health/live`
- endpoint `GET /health/ready`
- checks reais para Postgres, RabbitMQ, Ollama, modelos e filas

### Comportamento de readiness

`/health/ready` retorna:

- `200` quando banco, broker, Ollama, filas e modelos estao prontos
- `503` quando qualquer dependencia falha

Tambem foi implementada normalizacao de nomes de modelo para tratar alias do Ollama como:

- `nomic-embed-text`
- `nomic-embed-text:latest`

## 7. Workers Python

Foi criado um scaffold minimo em `agents/` com:

- baseline `uv`
- imagem unica baseada em `python:3.12-slim`
- `content_agent/main.py`
- `review_agent/main.py`
- camada compartilhada em `agents/shared/bootstrap/`

### O bootstrap compartilhado faz:

- carregamento e validacao das variaveis de ambiente
- conexao com Postgres
- conexao com RabbitMQ
- verificacao do Ollama e dos modelos obrigatorios
- declaracao da fila do worker e da DLQ
- criacao do cache local para Hugging Face
- emissao de logs estruturados em JSON
- heartbeat periodico

### Healthcheck dos workers

Cada worker passou a expor healthcheck por comando:

```bash
python -m shared.bootstrap.healthcheck --agent content
python -m shared.bootstrap.healthcheck --agent review
```

## 8. Reranker local

O reranker continua embutido nos workers, sem servico dedicado.

Foi adicionado um passo opcional para preaquecer o cache:

```powershell
docker compose --profile manual run --rm reranker-cache-init
```

Esse bootstrap usa `huggingface_hub.snapshot_download` para baixar `BAAI/bge-reranker-base` no volume compartilhado `hf_cache`.

## 9. Variaveis de ambiente

Foi estabelecido o contrato inicial de variaveis em `/.env.example` e `/.env`, cobrindo:

- banco
- RabbitMQ
- Ollama
- embeddings e reranker
- configuracao do orchestrator
- placeholders de auth para a proxima parte

## 10. Documentacao consolidada

Os documentos que estavam na raiz do projeto foram centralizados em `docs/`:

- `docs/ai-content-engine-steps.md`
- `docs/plano-de-acao-mvp.md`
- `docs/questionario-decisoes-mvp.md`

Foi adicionado tambem:

- `docs/README.md` como indice
- `docs/parte-1-alteracoes.md` como log da implementacao

## 11. Validacoes executadas

As seguintes validacoes foram executadas durante a implementacao:

- `corepack pnpm build` no orchestrator
- `python -m compileall agents`
- `docker compose config`
- `docker compose up -d`
- `curl http://localhost:3000/health/live`
- `curl http://localhost:3000/health/ready`
- `curl http://localhost:11434/api/tags`
- `docker compose exec postgres psql -U app -d ai_content_engine -c "\dx"`
- healthcheck manual de `content-worker`
- healthcheck manual de `review-worker`
- `docker compose --profile manual run --rm reranker-cache-init`

## 12. Estado final da Parte 1

Ao fim desta etapa:

- todos os servicos principais sobem localmente
- Postgres sobe com `vector` e `pgcrypto`
- RabbitMQ sobe com management
- Ollama sobe e fica com os 3 modelos esperados
- o orchestrator valida dependencias e filas
- os workers conectam em banco, fila e Ollama
- o reranker pode ser pre-carregado em cache local

## 13. Pendencias deixadas para as proximas partes

Esta etapa nao implementa ainda:

- auth funcional
- migrations de dominio
- DTOs e contratos de negocio
- persistencia de `generations`, `generation_steps` e demais tabelas
- RPC funcional de steps
- logica de `content_agent` e `review_agent`

