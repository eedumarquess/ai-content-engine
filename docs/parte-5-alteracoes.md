# Parte 5 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 5 do MVP: a shared layer Python dos agents passou a concentrar contratos, clientes de modelo, retrieval, rerank, prompts, repair, tracing e a base de consumo RabbitMQ.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- cliente LLM Ollama para `qwen2.5:7b` e `qwen2.5:3b`
- cliente de embeddings Ollama para `nomic-embed-text`
- retrieval vetorial com filtros por `doc_type`, `platform`, `user_id` e tags
- reranker local com `BAAI/bge-reranker-base`
- prompt loader com versionamento por arquivo
- schemas Pydantic v2 para requests, replies, retrieval e tracing
- exportacao de JSON Schema da shared layer
- repair service com revalidacao e ate 3 tentativas
- trace writer com agregacao de custo por geracao
- worker base RabbitMQ com contrato padronizado de consumo e resposta

## 2. Estrutura adicionada em `agents/shared`

Foram adicionados os seguintes blocos:

- `shared/llm/`
- `shared/rag/`
- `shared/prompts/`
- `shared/repair/`
- `shared/tracing/`
- `shared/rabbit/`
- `shared/schemas/`

Objetivo da organizacao:

- evitar duplicacao entre `content_agent`, `review_agent` e futuros agents
- manter o contrato RPC e os schemas tecnicos centralizados
- padronizar a integracao com Ollama, Postgres e RabbitMQ

## 3. Cliente LLM e embeddings

Foi implementado `agents/shared/llm/client.py`.

Capacidades entregues:

- chamada assincrona ao endpoint `/api/generate` do Ollama
- suporte ao modelo principal e ao modelo de repair
- suporte a `system`, `format`, `keep_alive` e options de inferencia
- normalizacao de tokens e duracoes em uma estrutura reutilizavel

Tambem foi implementado `agents/shared/rag/embedder.py`.

Capacidades entregues:

- chamada ao endpoint `/api/embed`
- fallback para `/api/embeddings` no modo legado de embedding unico
- metadados padronizados de provider, modelo e duracao

## 4. Retrieval e rerank

Foi implementado `agents/shared/rag/retriever.py`.

Comportamento padronizado:

- converte embedding para o formato esperado pelo `pgvector`
- consulta `rag_documents`
- filtra por `doc_type`
- respeita `platform` com fallback para documentos globais
- respeita `user_id` com fallback para documentos globais
- filtra por sobreposicao de tags
- ordena por similaridade vetorial

Foi implementado `agents/shared/rag/reranker.py`.

Comportamento:

- lazy load do `CrossEncoder`
- uso local do modelo `BAAI/bge-reranker-base`
- rerank assincrono via `asyncio.to_thread`
- retorno de documentos enriquecidos com `rerank_score`

## 5. Prompt versioning e repair

Foi implementado `agents/shared/prompts/loader.py` com:

- resolucao de prompts por pasta de agent
- descoberta da ultima versao disponivel
- renderizacao via Jinja
- suporte ao padrao especial `repair/repair_v1.jinja`

Foi adicionado o prompt inicial:

- `agents/prompts/repair/repair_v1.jinja`

Foi implementado `agents/shared/repair/repair.py`.

Fluxo entregue:

1. tenta extrair JSON do output bruto
2. valida com Pydantic
3. se falhar, renderiza o prompt de repair
4. chama `qwen2.5:3b`
5. revalida
6. repete ate o limite configurado
7. levanta erro estruturado quando o repair e exaurido

Observacao:

- a base de repair foi entregue aqui, mas o disparo automatico dentro de `content_agent` e `review_agent` continua como parte das proximas etapas

## 6. Schemas e exportacao JSON Schema

Foi criada a pasta `agents/shared/schemas/`.

Artefatos principais:

- `step-rpc.request.v1.schema.json`
- `step-rpc.success-reply.v1.schema.json`
- `step-rpc.failure-reply.v1.schema.json`
- `retrieval-filters.v1.schema.json`
- `retrieved-document.v1.schema.json`
- `llm-trace-record.v1.schema.json`

Esses schemas cobrem:

- request RPC enviada pelo orchestrator
- reply de sucesso e falha do worker
- filtros e documentos de retrieval
- shape persistido para `llm_traces`

Foi implementado tambem `agents/shared/schemas/export_json_schemas.py`, que gera os arquivos em `agents/shared/schemas/generated/`.

## 7. Tracing e custo

Foi implementado `agents/shared/tracing/trace_writer.py`.

Capacidades entregues:

- normalizacao de previews dos documentos recuperados
- calculo de custo por modelo/provider
- persistencia em `llm_traces`
- atualizacao incremental de `generation_costs`

Importante:

- a persistencia ficou pronta na shared layer
- a chamada efetiva por `content_agent` e `review_agent` depende da implementacao dos handlers nas Partes 6 e 7

## 8. Worker base RabbitMQ

Foi implementado `agents/shared/rabbit/worker.py`.

Contrato entregue:

- validacao do payload com Pydantic
- reply com o mesmo `correlation_id`
- envelopes de sucesso e falha padronizados
- `reply_metadata` consistente com o contrato do orchestrator
- tratamento de erro interno com `ApiErrorResponse`

Objetivo:

- permitir que qualquer agent novo reutilize a mesma base de consumo RPC

## 9. Compatibilidade e importacao

O pacote `shared` passou a expor os componentes centrais por lazy import.

Motivacao:

- evitar import eager de dependencias opcionais em ambientes de teste
- permitir que contratos e utilitarios leves sejam usados sem exigir RabbitMQ ou Postgres no import inicial

## 10. Testes e validacao

Cobertura adicionada nesta etapa:

- `agents/tests/test_shared_layer.py`

Cenarios cobertos:

- exportacao dos JSON Schemas da shared layer
- carregamento e renderizacao de prompt versionado
- montagem dos filtros SQL de retrieval
- parsing e repair de JSON invalido
- serializacao dos envelopes de reply do worker
- validacao do request RPC padronizado

Ultimas verificacoes executadas:

- `python -m unittest discover -s tests`
- `python -m shared.schemas.export_json_schemas`

## 11. Estado final da Parte 5

Ao fim desta etapa:

- a base reutilizavel dos agents ficou pronta
- retrieval, rerank, validacao, tracing e contrato RabbitMQ ficaram padronizados
- a exportacao JSON Schema da shared layer passou a existir no repositorio
- o projeto ja tem infraestrutura para prompts versionados e repair

## 12. Pendencias deixadas para as proximas partes

Esta etapa nao implementa ainda:

- handlers reais de `content_agent`
- handlers reais de `review_agent`
- uso do worker base em execucao ponta a ponta
- acionamento do repair loop a partir dos handlers
- gravacao efetiva de `llm_traces` e `generation_costs` pelos agents em runtime
