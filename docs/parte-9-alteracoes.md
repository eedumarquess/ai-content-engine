# Parte 9 - Alteracoes implementadas

Este documento registra o que ficou consolidado na Parte 9 do MVP: os prompts passaram a existir como artefatos versionados no repositorio e o `prompt_version` passou a ser propagado por todo o fluxo tecnico.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- prompts em arquivo para `content_agent`
- prompts em arquivo para `review_agent`
- prompt de repair em arquivo
- resolucao versionada via `PromptLoader`
- propagacao de `prompt_version` no RPC
- persistencia de `prompt_version` em trace e `reply_metadata`

## 2. Estrutura de prompts versionados

O repositorio passou a conter:

- `agents/prompts/content/v1.jinja`
- `agents/prompts/content/v2.jinja`
- `agents/prompts/review/v1.jinja`
- `agents/prompts/review/v2.jinja`
- `agents/prompts/repair/repair_v1.jinja`

Objetivo:

- remover prompt principal hardcoded
- permitir auditoria por versao
- preparar evolucao incremental de instrucoes sem quebrar o contrato

## 3. Padrao aplicado

Os prompts principais passaram a ser montados com secoes estaveis:

- papel do agent
- tarefa principal
- regras de escrita ou revisao
- contexto recuperado
- schema JSON esperado

O `PromptLoader` resolve:

- o caminho do agent
- a versao pedida pelo orchestrator
- a renderizacao final via Jinja

## 4. Propagacao do `prompt_version`

O `prompt_version` agora aparece em:

- request RPC enviada pelo orchestrator
- `reply_metadata` devolvido pelos workers
- `llm_traces.prompt_version`
- resposta de `GET /generations/:id` por step

Resultado:

- cada chamada de modelo passou a ser auditavel pelo template exato que a originou

## 5. Estado final da Parte 9

Ao fim desta etapa:

- os prompts do MVP ficaram versionados no repositorio
- o fluxo completo preserva `prompt_version`
- a trilha de auditoria do prompt ficou consistente entre Python e NestJS
