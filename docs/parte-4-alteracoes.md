# Parte 4 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 4 do MVP: o orchestrator NestJS passou a controlar criacao de geracao, execucao assincrona do pipeline, retry, DLQ, recovery no startup e consolidacao do estado final.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- separacao entre fluxo de criacao e fluxo de consulta da API
- ACK imediato no `POST /generate-content`
- consulta de progresso e resultado em `GET /generations/:id`
- `PipelineExecutor` com execucao sequencial `content -> review`
- cliente RPC RabbitMQ no `orchestrator`
- retry por step com timeout e DLQ
- idempotencia por `generation_id + step_name`
- recovery de geracoes `queued` e `running` apos restart

## 2. Reorganizacao do modulo de geracoes

O modulo `orchestrator/src/generations/` foi dividido em responsabilidades menores:

- `generate.controller.ts`
- `generate.service.ts`
- `generations.controller.ts`
- `generations-query.service.ts`
- `generations.repository.ts`
- `generations-data.module.ts`

Decisoes aplicadas:

- `GenerateController` ficou responsavel apenas por `POST /generate-content`
- `GenerationsController` ficou responsavel apenas por `GET /generations/:id`
- o contrato publico da API nao mudou
- a persistencia SQL operacional saiu da camada de controller/service e foi centralizada em `GenerationsRepository`

## 3. Criacao assincrona de geracoes

O fluxo do `POST /generate-content` agora faz:

1. valida request com `ContractsService`
2. carrega o preset ativo por usuario
3. insere `generations` com `status = queued`
4. insere `generation_steps` com um row por step do preset
5. responde com ACK sem esperar workers
6. agenda execucao local via `GenerationDispatcher`

### Persistencia inicial

Cada `generation_step` nasce com:

- `status = queued`
- `attempt_count = 0`
- `input_json` com snapshot inicial do request e metadados da geracao
- `reply_metadata = {}`

Observacao:

- como nao houve migration nova nesta etapa, `persona_id` passou a ser preservado dentro do snapshot inicial de `input_json`

## 4. PipelineExecutor

Foi implementado `orchestrator/src/pipeline/pipeline-executor.ts`.

Responsabilidades:

- adquirir lock por geracao com `pg_try_advisory_lock(hashtextextended(...))`
- marcar geracao como `running` no primeiro processamento
- executar os steps do preset em ordem
- montar o payload RPC por step
- aplicar timeout de 5 minutos por step
- aplicar retry de ate 3 tentativas por step
- persistir `input_json`, `output_json`, `attempt_count`, `error_json` e `reply_metadata`
- validar o documento retornado no NestJS antes de marcar step como `completed`
- consolidar `result_json` e `status = completed`
- marcar `status = failed` e publicar DLQ em falha terminal

### Regras de execucao aplicadas

- step `completed` nao e reexecutado
- retry incrementa `attempt_count` no inicio da tentativa
- `correlation_id` foi definido como `generation_id:step_name:attempt_n`
- reply tardio de tentativa antiga e descartado se nao houver mais promise pendente para aquele `correlation_id`
- o ultimo resultado da geracao e derivado do ultimo step concluido na ordem do preset, nao pelo maior numero de tentativas

## 5. RPC RabbitMQ e DLQ

Foi adicionada a pasta `orchestrator/src/rabbit/` com:

- `rabbit.module.ts`
- `rabbit-rpc.client.ts`
- `rabbit-dlq.service.ts`
- `rabbit.types.ts`

### RabbitRpcClient

O client RPC agora:

- mantem conexao e channel no processo do orchestrator
- cria uma reply queue exclusiva e auto-delete no bootstrap
- publica para a fila do step com `replyTo` + `correlationId`
- controla promises pendentes por `correlation_id`
- rejeita a promise em timeout

### RabbitDlqService

O publisher de DLQ envia para `STEP_DLQ_QUEUE` um envelope com:

- `generation_id`
- `user_id`
- `pipeline_preset_id`
- `step_name`
- `queue`
- `attempt_count`
- `correlation_id`
- `input_json`
- `output_json`
- `error_json`
- `reply_metadata`
- `failed_at`

Nao foi implementado replay de DLQ nesta etapa.

## 6. Recovery no startup

Foi implementado `orchestrator/src/pipeline/pipeline-recovery.service.ts`.

Comportamento:

- roda no bootstrap da aplicacao
- busca geracoes com `status IN ('queued', 'running')` e `completed_at IS NULL`
- reencaminha cada uma para o `GenerationDispatcher`

Objetivo:

- evitar perda de execucao quando o `POST` ja respondeu ACK, mas o processo reiniciou antes de concluir o pipeline

## 7. Consulta de geracao

`GenerationsQueryService` preserva o contrato publico ja definido na Parte 3:

- valida `generation_id`
- carrega geracao e steps do usuario autenticado
- monta `result`, `errors` e `metadata.steps`
- continua devolvendo fallback estruturado quando `error_json` persistido e invalido

## 8. Modulos e wiring

Foram adicionados:

- `PipelineModule`
- `RabbitModule`
- `GenerationsDataModule`

`AppModule` passou a importar os modulos necessarios para disponibilizar:

- criacao da geracao
- consulta da geracao
- dispatcher assincrono
- executor do pipeline
- recovery no startup
- RPC RabbitMQ
- publicacao em DLQ

## 9. Validacoes e testes

Cobertura adicionada nesta etapa:

- `generate.controller.test.ts`
- `generate.service.test.ts`
- `generations.controller.test.ts`
- `generations-query.service.test.ts`
- `pipeline-executor.test.ts`
- `pipeline-recovery.service.test.ts`

Cenarios cobertos:

- ACK imediato do `POST /generate-content`
- disparo assincrono do dispatcher sem bloquear a request
- consulta de geracao `completed`
- consulta de geracao `running`
- fallback estruturado quando `error_json` invalido esta persistido
- execucao sequencial de `content -> review`
- retry ate 3 tentativas
- publicacao em DLQ na falha terminal
- redispatch de geracoes pendentes no startup

Ultima verificacao executada:

- `corepack pnpm test`

## 10. Estado final da Parte 4

Ao fim desta etapa:

- o orchestrator responde com `generation_id` sem esperar workers
- o estado de geracoes e steps passou a ser controlado pelo NestJS
- retry, timeout, DLQ e recovery ficaram centralizados no orchestrator
- o contrato publico da API foi preservado
- a base de execucao ficou pronta para ser consumida pelos workers Python das proximas partes

## 11. Pendencias deixadas para as proximas partes

Esta etapa nao implementa ainda:

- workers Python respondendo o contrato RPC em execucao real
- repair loop dos agents
- persistencia de `llm_traces` e `generation_costs`
- `POST /performance-events`
- replay manual de mensagens da DLQ
