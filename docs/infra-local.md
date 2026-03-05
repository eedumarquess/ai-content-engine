# Infra local do MVP

Esta etapa sobe a base executavel do AI Content Engine em Docker Desktop, com Postgres, RabbitMQ, Ollama, um orchestrator NestJS minimo e dois workers Python minimos.

## Documentacao relacionada

- [Indice da documentacao](./README.md)
- [Resumo das alteracoes da Parte 1](./parte-1-alteracoes.md)
- [Resumo das alteracoes da Parte 2](./parte-2-alteracoes.md)
- [Plano do MVP](./plano-de-acao-mvp.md)

## Pre-requisitos

- Docker Desktop com Compose v2 habilitado
- Internet na primeira subida para baixar imagens, modelos Ollama e, opcionalmente, o reranker do Hugging Face
- Pelo menos 16 GB de RAM util
- Pelo menos 15 GB livres em disco para imagens, volumes e modelos

## Arquivos de ambiente

- O contrato versionado fica em `/.env.example`
- O compose local usa `/.env`
- Os valores default sao locais e servem apenas para desenvolvimento
- Se alguma porta host ja estiver ocupada, ajuste `POSTGRES_HOST_PORT`, `RABBITMQ_AMQP_HOST_PORT`, `RABBITMQ_MANAGEMENT_HOST_PORT`, `OLLAMA_HOST_PORT` ou `ORCHESTRATOR_HOST_PORT` no `/.env`

## Subida padrao em CPU

```powershell
docker compose up --build -d
```

O primeiro bootstrap pode demorar varios minutos porque `ollama-model-init` vai baixar `qwen2.5:7b`, `qwen2.5:3b` e `nomic-embed-text`.

Depois que os modelos estiverem prontos, o servico one-shot `db-bootstrap` aplica migrations, cria o admin bootstrap, seeda `persona`, `knowledge` e `content_review_v1`, gera embeddings reais e valida o resultado antes de liberar `orchestrator` e workers.

## Subida com GPU opcional

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
```

Use esse fluxo apenas quando o host suportar passthrough de GPU para Docker.

## Validacoes rapidas

```powershell
docker compose ps
docker compose logs db-bootstrap
curl.exe http://localhost:3000/health/live
curl.exe http://localhost:3000/health/ready
curl.exe http://localhost:11434/api/tags
docker compose exec postgres psql -U app -d ai_content_engine -c "\dx"
docker compose exec postgres psql -U app -d ai_content_engine -c "SELECT id, name, is_active FROM pipeline_presets;"
docker compose exec postgres psql -U app -d ai_content_engine -c "SELECT doc_type, COUNT(*) FROM rag_documents GROUP BY doc_type;"
```

## Comandos manuais do banco

Se quiser rerodar apenas a etapa de banco depois do build do `orchestrator`:

```powershell
docker compose run --rm db-bootstrap
```

Para validar manualmente o bootstrap dentro do `orchestrator`:

```powershell
docker compose run --rm orchestrator node dist/database/cli/verify.js
```

## RabbitMQ management

- URL: `http://localhost:15672`
- Usuario default: `app`
- Senha default: `app`

## Provisionamento opcional do reranker

O reranker `BAAI/bge-reranker-base` fica dentro dos workers, usando o volume `hf_cache`. Para preaquecer esse cache:

```powershell
docker compose --profile manual run --rm reranker-cache-init
```

Esse passo nao faz parte do criterio minimo de pronto da Parte 1, mas evita o primeiro uso lento quando o reranker passar a ser chamado nas proximas partes.

## Warm restart

Depois da primeira subida, os modelos Ollama ficam no volume `ollama_data`. Um novo `docker compose up -d` nao deve baixar tudo de novo.

As migrations e os seeds continuam idempotentes. Se voce recriar apenas o `db-bootstrap`, ele nao deve duplicar dados.

## Dados seedados

- O usuario admin bootstrap usa `AUTH_BOOTSTRAP_ADMIN_EMAIL` e `AUTH_BOOTSTRAP_ADMIN_PASSWORD`
- Os documentos seedados de `persona` e `knowledge` pertencem a esse usuario e nao sao globais
- O preset global `content_review_v1` fica disponivel para qualquer usuario autenticado via UUID fixo `c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1`

## Falhas esperadas

- Se `rabbitmq` cair, `/health/ready` do orchestrator retorna `503`
- Se um dos modelos do Ollama nao estiver disponivel, `/health/ready` retorna `503`
- Se `DATABASE_URL`, `AMQP_URL`, `OLLAMA_BASE_URL` ou `RERANKER_MODEL` estiverem ausentes, os containers de app falham cedo

## Licencas

- `qwen2.5:7b` e `nomic-embed-text` devem ser revisados conforme os termos publicados pelo Ollama e pelos autores dos modelos
- `qwen2.5:3b` usa a familia de licencas Qwen e deve ser validado antes de qualquer uso fora do escopo local de desenvolvimento
- `BAAI/bge-reranker-base` vem do Hugging Face e herda os termos publicados na pagina do modelo
