# Parte 11 - Alteracoes implementadas

Este documento registra o que ficou consolidado na Parte 11 do MVP: a observabilidade tecnica passou a ficar visivel tanto no banco quanto na resposta da API de consulta da geracao.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- enriquecimento de `reply_metadata` com `cost_usd`
- persistencia de traces com custo e bruto invalido do repair
- exposicao de telemetria por step em `GET /generations/:id`
- agregacao de metricas por geracao no response
- compatibilidade com identificadores preparados para OpenTelemetry
- atualizacao dos JSON Schemas compartilhados e do contrato HTTP

## 2. Telemetria no reply dos workers

`WorkerReplyMetadata` passou a carregar:

- `tokens_in`
- `tokens_out`
- `latency_ms`
- `cost_usd`
- `repair_attempts`
- `trace_id`

Isso foi refletido em:

- schemas Pydantic compartilhados
- JSON Schemas gerados da shared layer
- normalizacao de `reply_metadata` no orchestrator

## 3. Exposicao em `GET /generations/:id`

`GenerationsQueryService` passou a devolver por step:

- `agent_name`
- `model`
- `prompt_version`
- `tokens_in`
- `tokens_out`
- `latency_ms`
- `cost_usd`
- `repair_attempts`
- `trace_id`

E passou a agregar em `metadata.metrics`:

- `total_tokens_in`
- `total_tokens_out`
- `total_latency_ms`
- `total_cost_usd`
- `total_repair_attempts`
- `completed_steps`
- `failed_steps`

## 4. Contrato atualizado

Foi atualizada a source of truth em Python e reexportados os schemas gerados:

- `generation-status.response.v1.schema.json`
- `step-rpc.success-reply.v1.schema.json`
- `step-rpc.failure-reply.v1.schema.json`

Isso manteve NestJS e Python alinhados apos a expansao da telemetria.

## 5. Testes e validacao

Cobertura reforcada:

- contratos exportados em `agents/tests/test_contracts.py`
- shared layer em `agents/tests/test_shared_layer.py`
- consulta de geracao em `orchestrator/src/generations/generations-query.service.test.ts`

Cenarios cobertos:

- schema atualizado da resposta de status
- serializacao de `reply_metadata.cost_usd`
- agregacao correta de metricas no response da geracao
- exposicao de telemetria por step

Ultimas verificacoes executadas:

- `python -m shared.contracts.export_schemas`
- `python -m shared.schemas.export_json_schemas`
- `python -m unittest discover -s tests`
- `corepack pnpm test`

## 6. Estado final da Parte 11

Ao fim desta etapa:

- cada step passou a expor telemetria operacional util
- o custo e a latencia agregados podem ser consultados pela API
- a base ficou mais pronta para integracao futura com OpenTelemetry
