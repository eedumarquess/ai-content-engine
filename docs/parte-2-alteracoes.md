# Parte 2 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 2 do MVP: schema inicial do banco, seed idempotente, preset de pipeline, bootstrap one-shot e a fundacao de isolamento por usuario.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- migrations versionadas sem ORM, executadas pelo `orchestrator`
- schema inicial completo do MVP em Postgres + `pgvector`
- seed bootstrap com usuario admin, `persona`, `knowledge` e preset global
- embeddings reais gerados via Ollama durante o seed
- verificacao automatica do bootstrap
- integracao do banco ao fluxo local com `db-bootstrap`
- repositorio interno para carregar presets ativos por usuario

## 2. Estrutura criada no `orchestrator`

Foi adicionada a base de banco em `orchestrator/src/database/` com:

- `client.ts`
- `constants.ts`
- `migrate.ts`
- `seed.ts`
- `verify.ts`
- `ollama.ts`
- `password.ts`
- `seed-data.ts`
- `migrations/001_initial_schema.ts`
- `cli/bootstrap.ts`
- `cli/migrate.ts`
- `cli/seed.ts`
- `cli/verify.ts`

Tambem foi criada a pasta `orchestrator/src/pipeline-presets/` com:

- `pipeline-preset.types.ts`
- `pipeline-presets.repository.ts`

## 3. Variaveis de ambiente e scripts

O `orchestrator` passou a validar tambem:

- `EMBEDDING_DIM`
- `AUTH_REALM`
- `AUTH_BOOTSTRAP_ADMIN_EMAIL`
- `AUTH_BOOTSTRAP_ADMIN_PASSWORD`

Foram adicionados os scripts:

- `db:migrate`
- `db:seed`
- `db:bootstrap`
- `db:verify`

Esses comandos usam o `dist/database/cli/*.js` gerado pelo build do TypeScript.

## 4. Migration inicial do schema

A migration `001_initial_schema.sql` e renderizada em runtime com `EMBEDDING_DIM` e cria:

- `schema_migrations`
- `users`
- `pipeline_presets`
- `generations`
- `generation_steps`
- `rag_documents`
- `llm_traces`
- `generation_costs`
- `performance_events`

### Regras relevantes do schema

- `users` usa indice unico em `lower(email)` para unicidade case-insensitive
- `pipeline_presets.steps` e `generations.pipeline` aceitam apenas `jsonb` objeto
- `generation_steps` tem `UNIQUE(generation_id, step_name)` para idempotencia por step
- `rag_documents.doc_type` aceita apenas `persona`, `knowledge` e `performance`
- `llm_traces` e `performance_events` validam shape minimo de `jsonb`
- checks de nao-negatividade foram aplicados em contadores, custo e latencia

### Indices adicionados

- `rag_documents_type_idx`
- `rag_documents_user_idx`
- `rag_documents_platform_idx`
- `rag_documents_tags_gin_idx`
- `rag_documents_embedding_idx` com `ivfflat`
- `generations_user_created_at_idx`
- `generation_steps_generation_idx`
- `llm_traces_generation_idx`
- `llm_traces_step_idx`
- `performance_events_user_created_at_idx`
- `performance_events_platform_created_at_idx`
- `performance_events_generation_idx`

## 5. Runner de migrations

O runner de migrations foi implementado sem framework externo, usando `pg`:

- aplica migrations em ordem lexicografica
- executa preflight de `vector` e `pgcrypto`
- usa `pg_advisory_lock` para evitar concorrencia no bootstrap
- registra `filename`, `checksum` e `applied_at` em `schema_migrations`
- valida checksum para detectar drift em migration ja aplicada
- usa transacao por migration

## 6. Seed bootstrap

O seed passou a ser idempotente e cobre:

- usuario admin criado a partir de `AUTH_BOOTSTRAP_ADMIN_EMAIL`
- senha armazenada com hash `scrypt`
- 1 documento `persona` para o admin bootstrap
- 3 documentos `knowledge` para o admin bootstrap
- preset global `content_review_v1`

### Preset seedado

O preset global nasce com:

- `id = c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1`
- `name = content_review_v1`
- `user_id = NULL`
- `is_active = TRUE`

O payload de `steps` segue o formato:

```json
{
  "version": "v1",
  "steps": [
    {
      "name": "content",
      "agent": "content",
      "queue": "content.rpc",
      "timeout_ms": 300000,
      "max_retries": 3
    },
    {
      "name": "review",
      "agent": "review",
      "queue": "review.rpc",
      "timeout_ms": 300000,
      "max_retries": 3
    }
  ]
}
```

### Documentos seedados

Os documentos seedados em `rag_documents` foram desenhados para portfolio tecnico e LinkedIn:

- `persona`: voz tecnica, direta e orientada a engenharia de conteudo
- `knowledge`: estrutura de `hook/body/cta`
- `knowledge`: heuristicas de revisao
- `knowledge`: talking points de RAG, tracing e LLM em producao

Todos esses documentos pertencem ao usuario bootstrap e nao sao globais.

## 7. Embeddings e persistencia vetorial

O seed gera embeddings reais chamando o Ollama via HTTP:

- tenta primeiro `/api/embed`
- mantem fallback para `/api/embeddings`
- valida que a dimensao retornada bate com `EMBEDDING_DIM`
- persiste o vetor em `rag_documents.embedding`

Se a dimensao nao bater, o bootstrap falha cedo.

## 8. Verificacao automatica

Foi implementado `db:verify`, que valida:

- existencia das tabelas obrigatorias
- existencia dos indices criticos
- existencia do admin bootstrap
- existencia e visibilidade do preset global
- existencia dos 4 documentos seedados
- ownership dos documentos pelo usuario bootstrap
- dimensao correta dos embeddings
- isolamento basico: um segundo usuario nao ve `persona/knowledge` seedados

## 9. Integracao no `docker-compose`

Foi adicionado o servico one-shot `db-bootstrap`:

- usa a imagem do `orchestrator`
- depende de `postgres`, `ollama` e `ollama-model-init`
- executa `node dist/database/cli/bootstrap.js`
- sai com erro se migration, seed ou verify falharem

O `orchestrator`, `content-worker` e `review-worker` agora dependem de `db-bootstrap` com `service_completed_successfully`.

## 10. Fundacao multi-tenant

O isolamento nesta etapa ficou no nivel da aplicacao:

- `users`, `generations`, `performance_events` e `rag_documents` carregam `user_id`
- documentos globais continuam permitidos apenas quando `user_id IS NULL`
- `pipeline_presets` aceita preset global ou por usuario
- o repositorio `PipelinePresetsRepository` carrega apenas presets ativos que satisfacam:

```sql
is_active = TRUE
AND (user_id IS NULL OR user_id = :user_id)
```

RLS em Postgres continua fora do escopo desta fase.

## 11. Documentacao operacional atualizada

`docs/infra-local.md` passou a registrar:

- o papel do `db-bootstrap`
- a idempotencia de migrations e seeds
- os dados seedados
- o UUID fixo do preset `content_review_v1`

## 12. Validacoes executadas

As validacoes executadas durante esta implementacao foram:

- `corepack pnpm build`
- `docker compose config`
- smoke test local do bootstrap contra Postgres do Compose
- duas execucoes consecutivas de `node dist/database/cli/bootstrap.js` para validar idempotencia
- consultas SQL de verificacao para confirmar:
  - `1` usuario bootstrap
  - `4` documentos em `rag_documents`
  - `content_review_v1` ativo e global

Observacao: o smoke test do seed foi executado com um mock HTTP local de embeddings na mesma dimensao configurada, para validar o fluxo sem depender do download real dos modelos Ollama durante a checagem.

## 13. Estado final da Parte 2

Ao fim desta etapa:

- o banco sobe com schema inicial, checks, FKs e indices
- existe seed idempotente com embeddings e preset selecionavel
- o ambiente local passa por `db-bootstrap` antes de liberar a aplicacao
- o `orchestrator` ja consegue carregar preset ativo por usuario
- a base multi-tenant do MVP fica pronta para ser consumida pela API nas proximas partes

## 14. Pendencias deixadas para as proximas partes

Esta etapa nao implementa ainda:

- Basic Auth HTTP
- endpoints publicos de geracao ou listagem de presets
- escrita de `generations` e `generation_steps` pela API
- tracing funcional em execucao real de steps
- retrieval e rerank nos workers
