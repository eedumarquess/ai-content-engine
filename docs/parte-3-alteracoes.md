# Parte 3 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 3 do MVP: contrato global compartilhado, endpoints assincronos de geracao e exportacao versionada de schema entre Python e NestJS.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- contrato do `POST /generate-content`
- contrato do ACK inicial de geracao
- contrato do `GET /generations/:id`
- schema global versionado `GenerationDocumentV1`
- envelope padronizado de erros `errors: [{code, message, field, trace_id}]`
- exportacao de JSON Schema a partir do Pydantic para consumo no NestJS
- validacao dupla do contrato em Python e TypeScript

## 2. Source of truth do contrato

O arquivo `agents/shared/contracts/generation_v1.py` passou a concentrar os modelos compartilhados do MVP:

- `GenerateContentRequest`
- `GenerateContentAck`
- `GenerationDocumentV1`
- `GenerationExecutionMetadata`
- `GetGenerationResponse`
- `ApiError`

Decisoes aplicadas:

- Pydantic v2 e a fonte unica do contrato
- o NestJS consome JSON Schema exportado, em vez de manter um schema paralelo
- `schema_version` nasce como literal `'v1'`
- `extra = forbid` evita drift no payload

## 3. Contrato do `POST /generate-content`

Request implementado:

```json
{
  "topic": "RAG em producao",
  "platform": "linkedin",
  "format": "thread",
  "pipeline_preset_id": "uuid",
  "persona_id": "uuid|null"
}
```

Regras aplicadas:

- `topic`, `platform` e `format` sao obrigatorios e rejeitam branco puro
- `pipeline_preset_id` e obrigatorio e validado como `uuid`
- `persona_id` pode ser omitido no request e e normalizado para `null`
- o request do `POST` nao replica o schema global final; ele apenas abre a geracao e referencia o preset

ACK implementado:

```json
{
  "generation_id": "uuid",
  "status": "queued",
  "status_url": "/generations/uuid"
}
```

Regras aplicadas:

- `status` nasce fixo como `queued`
- `status_url` permanece relativo no MVP

## 4. Contrato do `GET /generations/:id`

Response implementado:

```json
{
  "generation_id": "uuid",
  "status": "queued|running|completed|failed",
  "result": {
    "topic": "RAG em producao",
    "strategy": {
      "goal": null,
      "angle": null,
      "audience": null
    },
    "post": {
      "hook": "Hook",
      "body": "Body",
      "cta": "CTA"
    },
    "media": {
      "image_prompt": null,
      "carousel": [],
      "video_prompt": null
    },
    "metadata": {
      "platform": "linkedin",
      "format": "thread",
      "pipeline": ["content", "review"],
      "generation_id": "uuid",
      "schema_version": "v1",
      "persona_id": null,
      "performance_context_used": null
    }
  },
  "errors": [
    {
      "code": "internal_error",
      "message": "string",
      "field": null,
      "trace_id": null
    }
  ],
  "metadata": {
    "pipeline_preset_id": "uuid",
    "schema_version": "v1",
    "created_at": "2026-03-06T00:00:00.000Z",
    "started_at": "2026-03-06T00:00:05.000Z|null",
    "completed_at": "2026-03-06T00:00:45.000Z|null",
    "steps": [
      {
        "name": "content",
        "status": "queued|running|completed|failed|dlq",
        "attempt_count": 0
      }
    ]
  }
}
```

Regras aplicadas:

- `result` so vem preenchido em `completed`
- `errors` so vem preenchido em `failed`; nos demais status, retorna `[]`
- `metadata.pipeline` preserva a ordem do preset persistido
- `created_at`, `started_at` e `completed_at` sao expostos como `date-time`
- quando `error_json` persistido nao respeita o contrato, a API devolve fallback estruturado com `internal_error`

## 5. Schema global `GenerationDocumentV1`

O documento final compartilhado entre agents e API passou a ser:

- `topic`
- `strategy.goal`
- `strategy.angle`
- `strategy.audience`
- `post.hook`
- `post.body`
- `post.cta`
- `media.image_prompt`
- `media.carousel`
- `media.video_prompt`
- `metadata.platform`
- `metadata.format`
- `metadata.pipeline`
- `metadata.generation_id`
- `metadata.schema_version`
- `metadata.persona_id`
- `metadata.performance_context_used`

Campos obrigatorios no MVP:

- `topic`
- `post.hook`
- `post.body`
- `post.cta`
- `metadata.platform`
- `metadata.format`
- `metadata.pipeline`
- `metadata.generation_id`
- `metadata.schema_version`

Campos opcionais ou vazios no MVP:

- `strategy.goal`
- `strategy.angle`
- `strategy.audience`
- `media.image_prompt`
- `media.carousel`
- `media.video_prompt`
- `metadata.persona_id`
- `metadata.performance_context_used`

Regras aplicadas:

- os objetos `strategy`, `post`, `media` e `metadata` sao obrigatorios
- os campos opcionais do MVP nao somem do payload final
- campos vazios saem como `null` ou `[]`
- `metadata.pipeline` e derivado do preset persistido

## 6. Envelope padronizado de erro

O contrato de erro passou a ser:

```json
{
  "errors": [
    {
      "code": "validation_error",
      "message": "Field is required.",
      "field": "topic",
      "trace_id": null
    }
  ]
}
```

Codigos previstos no contrato atual:

- `authentication_failed`
- `validation_error`
- `pipeline_preset_not_found`
- `generation_not_found`
- `step_failed`
- `step_timeout`
- `repair_exhausted`
- `internal_error`

Regras aplicadas:

- cada erro exige `code`, `message`, `field` e `trace_id`
- `field` e `trace_id` podem ser `null`, mas continuam presentes no payload
- o NestJS normaliza mensagens de `format` para manter consistencia com o restante da API

## 7. Artifacts gerados

O script `agents/shared/contracts/export_schemas.py` exporta os seguintes arquivos para `orchestrator/src/contracts/generated/`:

- `generate-content.request.v1.schema.json`
- `generate-content.ack.v1.schema.json`
- `generation-document.v1.schema.json`
- `generation-status.response.v1.schema.json`

Esses artifacts sao consumidos por `orchestrator/src/contracts/contracts.service.ts` via AJV.

## 8. Validacao e testes

Cobertura adicionada nesta etapa:

- `agents/tests/test_contracts.py`
- `orchestrator/src/contracts/contracts.service.test.ts`
- `orchestrator/src/generations/generations.service.test.ts`
- `orchestrator/src/generations/generations.controller.test.ts`

Cenarios cobertos:

- request valido sem `persona_id`
- rejeicao de `topic` em branco
- rejeicao de `pipeline_preset_id` invalido
- rejeicao de campos extras
- ACK com `generation_id`, `status` e `status_url`
- `GET /generations/:id` em `running` com `result = null`
- `GET /generations/:id` em `completed` com `GenerationDocumentV1` valido
- fallback de erro estruturado quando `error_json` persistido e invalido

Ultima verificacao executada:

- `python -m unittest tests.test_contracts`
- `corepack pnpm test`

## 9. Arquivos relevantes

- `agents/shared/contracts/generation_v1.py`
- `agents/shared/contracts/export_schemas.py`
- `agents/tests/test_contracts.py`
- `orchestrator/src/contracts/contracts.service.ts`
- `orchestrator/src/contracts/generated/`
- `orchestrator/src/generations/dto/`
- `orchestrator/src/generations/generations.service.ts`
- `orchestrator/src/generations/generations.service.test.ts`
