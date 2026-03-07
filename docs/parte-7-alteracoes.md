# Parte 7 - Alteracoes implementadas

Este documento registra o que foi implementado na Parte 7 do MVP: o `review_agent` passou a receber o documento consolidado do `content_agent`, revisar o texto sem quebrar o contrato e devolver o documento completo no mesmo schema global.

## 1. Escopo entregue

Esta etapa passou a cobrir:

- `ReviewStepHandler` com fluxo completo do step `review`
- prompts versionados `v1` e `v2` em `agents/prompts/review/`
- validacao do documento de entrada recebido do orchestrator
- retrieval de contexto de revisao com os mesmos filtros de isolamento do MVP
- rerank local do top 20 para top 5
- revisao do documento inteiro, nao de patch
- validacao, repair e tracing do output final
- execucao real do worker RabbitMQ em `review_agent/main.py`

## 2. Handler do `review_agent`

Foi implementado `agents/review_agent/handler.py`.

Fluxo entregue:

1. valida `step_name = review`
2. valida a presenca de `input_json.document`
3. valida o documento recebido com `GenerationDocumentV1`
4. monta query de revisao
5. executa retrieval e rerank
6. renderiza o prompt versionado
7. chama o LLM principal
8. aplica repair quando necessario
9. normaliza o metadata final
10. persiste trace e responde ao orchestrator

## 3. Query e contexto de revisao

O helper `build_review_query` usa:

- marcador semantico de `review`
- criterios de `clareza` e `conformidade`
- `platform`
- `format`
- `topic`
- `post.hook` do documento de entrada
- `persona_id` quando presente

Objetivo:

- orientar retrieval para heuristicas de edicao e conformidade
- preservar o tema e o angulo do documento original

O agrupamento de contexto continua dividido em:

- `persona_context`
- `knowledge_context`
- `performance_context`

## 4. Prompts versionados

Foram adicionados:

- `agents/prompts/review/v1.jinja`
- `agents/prompts/review/v2.jinja`

Direcao editorial aplicada:

- melhorar clareza, fluidez e conformidade
- nao alterar o objetivo do conteudo
- devolver sempre o documento inteiro
- evitar patch ou diff parcial

## 5. Metadata, repair e tracing

O `review_agent` passou a:

- manter `topic`, `platform`, `format`, `pipeline` e `generation_id` coerentes com a geracao
- herdar `performance_context_used` quando ele ja estava ativo no documento de entrada
- marcar `performance_context_used` tambem quando docs de performance entram no top 5 do review

O step usa o mesmo `RepairService` da shared layer:

- outputs invalidos entram no loop de repair
- falhas definitivas retornam `repair_exhausted`
- `raw_output` invalido fica persistido no trace

O trace agora registra:

- dados do prompt
- retrieval efetivo
- tokens e latencia
- custo estimado
- output final ou erro estruturado

## 6. Worker runtime

`agents/review_agent/main.py` passou a subir um worker RPC real com:

- `PgVectorRetriever`
- `LocalReranker`
- `PromptLoader`
- `OllamaClient`
- `RepairService`
- `TraceWriter`
- `RabbitRpcWorker` na fila `REVIEW_RPC_QUEUE`

Com isso, o segundo step do pipeline ficou operacional.

## 7. Testes e validacao

Cobertura adicionada nesta etapa:

- `agents/tests/test_review_agent.py`

Cenarios cobertos:

- composicao da query de revisao
- agrupamento de contexto com e sem memoria de performance
- normalizacao do metadata final
- rejeicao de documento ausente
- retorno valido em execucao nominal
- preservacao do flag `performance_context_used`
- acionamento do repair
- falha estruturada quando o repair e exaurido
- rejeicao de `step_name` incorreto

Ultimas verificacoes executadas:

- `python -m unittest discover -s tests`

## 8. Estado final da Parte 7

Ao fim desta etapa:

- o pipeline `content -> review` passou a ter os dois workers reais
- o `review_agent` melhora o documento sem quebrar o schema
- o output final permanece aderente ao contrato global versionado
