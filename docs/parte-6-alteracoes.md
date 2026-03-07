# Parte 6 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 6 do MVP: o `content_agent` deixou de ser apenas um placeholder e passou a executar retrieval, rerank, geracao, validacao, repair e tracing dentro do contrato RPC do orchestrator.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- `ContentStepHandler` com fluxo completo do step `content`
- prompts versionados `v1` e `v2` em `agents/prompts/content/`
- montagem da query com `persona + topic + format + platform`
- retrieval com filtro por `user_id`, `platform` e `doc_type`
- rerank local do top 20 para top 5
- agrupamento do contexto em blocos `persona`, `knowledge` e `performance`
- validacao do output pelo schema global
- persistencia de trace com custo e previews de retrieval
- execucao real do worker RabbitMQ em `content_agent/main.py`

## 2. Handler do `content_agent`

Foi implementado `agents/content_agent/handler.py`.

Responsabilidades principais:

- validar que o worker recebeu o `step_name = content`
- montar a query de retrieval a partir do request do orchestrator
- buscar documentos relevantes em `rag_documents`
- reranquear os resultados para reduzir ruido
- renderizar o prompt versionado com contexto recuperado
- chamar o modelo principal via shared layer
- aplicar repair quando o output nao satisfaz o schema
- devolver `output_json` valido e `reply_metadata` consistente

## 3. Query e retrieval

O helper `build_content_query` passou a concatenar:

- `persona_id` quando presente
- `topic`
- `format`
- `platform`

O retrieval usa `RetrievalFilters` com:

- `doc_types = ["persona", "knowledge", "performance"]`
- `platform` da request
- `user_id` autenticado da geracao

Objetivo:

- respeitar isolamento por usuario
- priorizar memoria operacional relevante para o contexto do post
- manter `performance_memory` como contexto opcional ja no MVP

## 4. Context building e prompts

Foram adicionados:

- `agents/prompts/content/v1.jinja`
- `agents/prompts/content/v2.jinja`

O handler passou a montar tres blocos textuais:

- `persona_context`
- `knowledge_context`
- `performance_context`

Cada bloco serializa:

- `source`
- `doc_type`
- `platform`
- `score`
- `rerank_score`
- `tags`
- `content`

Isso deixa o prompt auditavel e alinhado ao trace persistido.

## 5. Validacao, repair e metadata final

O `content_agent` passou a:

- validar a resposta com `GenerationDocumentV1`
- aplicar `RepairService` quando o JSON e invalido ou incompleto
- preencher deterministicamente `metadata.platform`, `metadata.format`, `metadata.pipeline`, `metadata.generation_id`, `metadata.schema_version`, `metadata.persona_id` e `metadata.performance_context_used`

Com isso, o worker nao depende do modelo para preencher campos tecnicos sensiveis corretamente.

## 6. Tracing e custo

O handler agora persiste `LlmTraceRecord` com:

- `generation_id`
- `step_name = content`
- `agent_name = content`
- `prompt_version`
- `prompt_text`
- `retrieved_doc_ids`
- `retrieved_docs_preview`
- `tokens_in`
- `tokens_out`
- `latency_ms`
- `cost_usd`
- `output_json`

Quando houve repair:

- o trace registra `error_json.code = repair_applied`
- o `raw_output` invalido fica guardado no trace

Quando o repair falha:

- o trace registra `repair_exhausted`
- o `raw_output` final invalido tambem fica persistido

## 7. Worker runtime

`agents/content_agent/main.py` deixou o modo heartbeat e passou a:

- inicializar `OllamaEmbedder`
- inicializar `OllamaClient`
- criar `PgVectorRetriever`
- criar `LocalReranker`
- criar `RepairService`
- criar `TraceWriter`
- subir `RabbitRpcWorker` na fila `CONTENT_RPC_QUEUE`

Isso coloca o `content_agent` no caminho real do pipeline `content -> review`.

## 8. Testes e validacao

Cobertura adicionada nesta etapa:

- `agents/tests/test_content_agent.py`

Cenarios cobertos:

- composicao da query de retrieval
- agrupamento de contexto com e sem memoria de performance
- normalizacao deterministica do metadata final
- uso correto dos filtros de retrieval
- retorno valido em execucao nominal
- acionamento do repair
- falha estruturada quando o repair e exaurido
- rejeicao de `step_name` incorreto

Ultimas verificacoes executadas:

- `python -m unittest discover -s tests`

## 9. Estado final da Parte 6

Ao fim desta etapa:

- o `content_agent` produz um documento global valido no schema `v1`
- o step passou a usar retrieval e rerank de forma real
- o worker responde ao orchestrator com metadados tecnicos padronizados
- o trace tecnico do step ficou persistido e auditavel
