# Parte 8 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 8 do MVP: a API passou a aceitar ingestao autenticada de eventos de performance e a preparar uma projecao canonica para uso futuro em `rag_documents`.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- endpoint `POST /performance-events`
- validacao estruturada do payload de performance
- persistencia em `performance_events`
- verificacao de ownership de `generation_id`
- ACK de persistencia com `event_id`
- projecao futura para memoria RAG

## 2. Endpoint autenticado

Foi criado:

- `orchestrator/src/performance-events/performance-events.controller.ts`

Comportamento:

- rota protegida por `BasicAuthGuard`
- `POST /performance-events`
- retorno `201 Created`
- response enxuta com `event_id` e `status = stored`

## 3. Validacao do payload

Foi implementado `PerformanceEventsService` com validacao via `zod`.

Formato minimo aceito:

- `generation_id`
- `platform`
- `post_id`
- `metrics.likes`
- `metrics.comments`
- `metrics.shares`
- `metrics.impressions`
- `metrics.engagement_rate`

Regras aplicadas:

- campos string sao normalizados por trim
- `generation_id` pode ser `null`
- `post_id` pode ser `null`
- metricas inteiras devem ser nao negativas
- `engagement_rate` deve ficar no intervalo `0..1`
- campos extras sao rejeitados com erro estruturado

## 4. Persistencia e ownership

Foi implementado:

- `orchestrator/src/performance-events/performance-events.repository.ts`

O fluxo de persistencia garante:

- `user_id` sempre vem do usuario autenticado
- `generation_id`, quando enviado, precisa pertencer ao mesmo usuario
- o evento fica armazenado com `platform`, `post_id` e `metrics`

Se a geracao nao pertencer ao usuario:

- a API retorna `generation_not_found`

## 5. Projecao futura para `rag_documents`

Foi adicionado o helper:

- `buildPerformanceMemoryProjection`

Objetivo:

- manter um shape canonico para futura ingestao em memoria de performance
- evitar reinventar o mapping quando o retrieval de `performance_memory` ficar mais forte

A projecao inclui:

- `platform`
- `tags`
- `content` sintetico
- `metadata` com `generation_id`, `post_id` e metricas originais

## 6. Integracao no app

Foi criado:

- `orchestrator/src/performance-events/performance-events.module.ts`

E o modulo passou a ser importado em:

- `orchestrator/src/app.module.ts`

Com isso, a API do orchestrator passou a expor o endpoint de forma nativa.

## 7. Testes e validacao

Cobertura adicionada nesta etapa:

- `orchestrator/src/performance-events/performance-events.controller.test.ts`
- `orchestrator/src/performance-events/performance-events.service.test.ts`

Cenarios cobertos:

- status `201` no controller
- persistencia de evento validado e normalizado
- rejeicao de payload invalido com erros estruturados
- rejeicao de `generation_id` sem ownership
- projecao canonica para futura memoria RAG

Ultimas verificacoes executadas:

- `corepack pnpm test`

## 8. Estado final da Parte 8

Ao fim desta etapa:

- o MVP aceita ingestao de performance de forma autenticada
- os eventos ficam persistidos por usuario
- a base ficou pronta para uso gradual de memoria de performance no retrieval futuro
