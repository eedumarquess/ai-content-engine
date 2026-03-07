# Plano de Acao do MVP - AI Content Engine

## 0. Objetivo do MVP

Entregar um MVP de portfolio que prove os fundamentos centrais do projeto:

- orquestracao centralizada em NestJS
- API assincrona com retorno imediato de `generation_id`
- pipeline fixo `content -> review`
- comunicacao interna via RabbitMQ com RPC entre orchestrator e agents
- RAG obrigatorio com Postgres + `pgvector`
- schema global versionado e validado com Pydantic v2
- repair loop para JSON invalido ou campos obrigatorios vazios
- tracing completo com custo, latencia, retrieval e persistencia no banco
- operacao 100% local com Docker + Ollama

Resultado esperado:

- `POST /generate-content` responde rapido com `generation_id`
- `GET /generations/:id` retorna status, resultado final ou falha estruturada
- `content_agent` e `review_agent` executam retrieval + rerank + geracao
- o sistema persiste `generations`, `generation_steps`, `llm_traces`, `generation_costs` e eventos de performance

## 1. Decisoes travadas

Estas decisoes ja estao fechadas e devem orientar toda a implementacao do MVP:

- orquestracao centralizada no NestJS
- API externa assincrona; RPC apenas na comunicacao interna com RabbitMQ
- multi-tenant com autenticacao basica e isolamento por usuario
- pipeline definido no banco e selecionado por preset na request
- schema global unico, versionado, com Pydantic v2 como fonte de verdade
- NestJS tambem valida a resposta final antes de expor ao cliente
- retry de ate 3 tentativas por step
- DLQ ativa para falhas definitivas
- `performance_memory` entra com persistencia e ingestao; uso no retrieval fica opcional na v1
- prompt completo e contexto recuperado podem ser persistidos no banco
- stack local: Ollama `qwen2.5:7b`, fallback/repair `qwen2.5:3b`, embeddings `nomic-embed-text`
- reranking local com `BAAI/bge-reranker-base`
- observabilidade preparada para integracao futura com OpenTelemetry

## 2. Escopo do MVP

### Incluido

- autenticacao basica para usuarios
- endpoint `POST /generate-content`
- endpoint `GET /generations/:id`
- endpoint `POST /performance-events`
- orquestrador NestJS com timeout, retry, idempotencia e consolidacao de estado
- RabbitMQ com RPC por step e DLQ para falhas finais
- Postgres com `pgvector`
- pipeline preset `content -> review`
- dois agents Python:
  - `content_agent`
  - `review_agent`
- prompt versioning por arquivo
- tracing, custo e latencia por step
- repair loop com ate 3 tentativas
- ingestao de memoria `persona`, `knowledge` e `performance`

### Fora do MVP

- `trend_agent`
- `strategy_agent`
- `media_agent`
- pipeline livre montado diretamente no payload
- busca hibrida textual + vetorial
- uso forte de `performance_memory` no retrieval por padrao
- circuit breaker e fallback entre providers diferentes
- rate limiting distribuido

## 3. Metricas de sucesso do MVP

O MVP deve ser avaliado com base nestas metricas operacionais:

- `success_rate`
- `latency_por_step`
- `latency_total`
- `repair_rate`
- `schema_valid_first_pass_rate`
- `tokens_por_geracao`
- `cost_por_geracao`

Meta inicial:

- ACK inicial do `POST /generate-content` em ate 2s
- geracao completa em ate 120s na maior parte dos casos
- timeout maximo de 5 minutos por step
- ate 50 geracoes por dia e 2 execucoes simultaneas no ambiente local

## 4. Estrategia de entrega

A implementacao deve seguir esta ordem:

1. Infra local e autenticacao
2. Banco, contratos e presets
3. API assincrona e orchestrator
4. shared layer dos agents
5. `content_agent`
6. `review_agent`
7. `performance_events` e memoria persistente
8. repair loop
9. tracing, custo e prontidao para OpenTelemetry
10. teste ponta a ponta

## 5. Plano por partes

### Parte 1 - Infra local e ambiente de execucao

#### Objetivo

Subir todo o ambiente local do MVP com Docker e garantir comunicacao entre todos os servicos.

#### Entregaveis

- `docker-compose` com:
  - Postgres + `pgvector`
  - RabbitMQ com management
  - Ollama
  - orchestrator NestJS
  - workers Python
- `.env` documentado
- inicializacao dos modelos locais

#### Passos

- [x] criar `docker-compose` com os servicos base
- [x] definir variaveis de ambiente de banco, fila, auth, models e embeddings
- [x] garantir extensoes `vector` e `pgcrypto` no Postgres
- [x] garantir conectividade entre NestJS, RabbitMQ, Ollama e workers
- [x] preparar script ou etapa de bootstrap para baixar `qwen2.5:7b`, `qwen2.5:3b` e `nomic-embed-text`
- [x] documentar como provisionar o reranker local

#### Criterio de pronto

- todos os servicos sobem localmente
- NestJS conecta em banco, fila e Ollama
- workers conectam em fila, banco e modelos locais

### Parte 2 - Banco, autenticacao e persistencia base

#### Objetivo

Criar a base de dados do MVP com multi-tenant, memoria RAG, pipeline presets e rastreabilidade por step.

#### Entregaveis

- migrations do schema inicial
- seed de usuario, persona, knowledge e preset de pipeline
- estrutura para eventos de performance

#### Passos

- [x] criar tabela `users` com suporte a autenticacao basica
- [x] criar tabela `pipeline_presets`
- [x] criar tabela `generations`
- [x] criar tabela `generation_steps`
- [x] criar tabela `rag_documents`
- [x] criar tabela `llm_traces`
- [x] criar tabela `generation_costs`
- [x] criar tabela `performance_events`
- [x] adicionar indices para `doc_type`, `platform`, `user_id`, `tags` e `embedding`
- [x] criar seed com docs de `knowledge`
- [x] criar seed com docs de `persona`
- [x] criar seed com um preset `content_review_v1`

#### Criterio de pronto

- banco sobe com todas as tabelas e indices
- existe isolamento basico por usuario
- existe um preset de pipeline selecionavel pela API

Status: concluido na implementacao atual, com `db-bootstrap`, preset global `content_review_v1` e isolamento por aplicacao baseado em `user_id`.

### Parte 3 - Contrato global e endpoints do MVP

#### Objetivo

Fechar o contrato da API, o schema global versionado e os formatos de erro antes de conectar os agents.

Status: concluido na implementacao atual, com Pydantic v2 como source of truth, exportacao de JSON Schema para o NestJS e validacao dupla do contrato.

#### Entregaveis

- request DTO do `POST /generate-content`
- response DTO do ACK inicial
- response DTO do `GET /generations/:id`
- schema global versionado exportado do Pydantic

#### Passos

- [x] definir payload do `POST /generate-content` com referencia ao preset de pipeline
- [x] definir retorno do ACK com `generation_id`, `status` e endpoint de consulta
- [x] definir retorno do `GET /generations/:id` com `status`, `result`, `errors` e metadados
- [x] definir o schema global com `topic`, `strategy`, `post`, `media` e `metadata`
- [x] marcar campos obrigatorios:
  - `topic`
  - `post.hook`
  - `post.body`
  - `post.cta`
  - `metadata.platform`
  - `metadata.format`
  - `metadata.pipeline`
  - `metadata.generation_id`
  - `metadata.schema_version`
- [x] marcar campos opcionais ou vazios no MVP:
  - `strategy.goal`
  - `strategy.angle`
  - `strategy.audience`
  - `media.image_prompt`
  - `media.carousel`
  - `media.video_prompt`
  - `metadata.persona_id`
  - `metadata.performance_context_used`
- [x] padronizar `errors: [{code, message, field, trace_id}]`

Documentacao detalhada desta etapa:

- [Implementacao da Parte 3](./parte-3-alteracoes.md)

#### Criterio de pronto

- NestJS e Python compartilham o mesmo contrato
- a API assina o modelo assincrono sem ambiguidade
- o schema global nasce com `schema_version = v1`

### Parte 4 - Orchestrator NestJS

#### Objetivo

Implementar o cerebro da operacao: auth, criacao da geracao, execucao do pipeline, retry, DLQ e consolidacao do resultado.

Status: concluido na implementacao atual, com `GenerateController`, `GenerationsQueryService`, `PipelineExecutor`, `RabbitRpcClient`, `RabbitDlqService`, retry por step, DLQ e recovery no startup.

#### Entregaveis

- autenticacao basica
- `POST /generate-content`
- `GET /generations/:id`
- `PipelineExecutor`
- cliente RPC RabbitMQ
- controle de status e idempotencia por step

#### Passos

- [x] implementar modulo de auth basico
- [x] criar `GenerateController` para iniciar geracoes
- [x] criar endpoint de consulta por `generation_id`
- [x] carregar o preset de pipeline a partir do banco
- [x] criar a linha em `generations` com status `queued`
- [x] executar `content -> review` em ordem sequencial
- [x] gerar `correlation_id` por `generation_id + step_name`
- [x] persistir `input_json`, `output_json`, `attempt_count` e `error_json` em `generation_steps`
- [x] aplicar timeout de 5 minutos por step
- [x] aplicar retry de ate 3 tentativas por step
- [x] enviar para DLQ quando o step falhar definitivamente
- [x] validar o output final no NestJS antes de expor
- [x] consolidar `result_json` e `status` final da geracao

Documentacao detalhada desta etapa:

- [Implementacao da Parte 4](./parte-4-alteracoes.md)

#### Criterio de pronto

- a API responde com `generation_id` sem esperar os workers
- a consulta por `generation_id` reflete progresso e resultado
- o orchestrator controla retries, DLQ e estado final

### Parte 5 - Shared layer dos agents Python

#### Objetivo

Criar os componentes reutilizaveis para todos os agents, alinhados a Ollama, Pydantic e tracing.

Status: concluido na implementacao atual, com cliente Ollama, embedder, retrieval, reranker, prompt loader, repair service, trace writer, worker base RabbitMQ e exportacao de JSON Schema da shared layer.

#### Entregaveis

- cliente LLM para Ollama
- cliente de embeddings
- retrieval com filtros
- reranker local
- prompt loader
- repair module
- trace writer
- worker base RabbitMQ

#### Passos

- [x] implementar `client.py` para `qwen2.5:7b` e `qwen2.5:3b`
- [x] implementar `embedder.py` com `nomic-embed-text`
- [x] implementar `retriever.py` com filtros por `doc_type`, `platform`, `user_id` e tags
- [x] implementar `reranker.py` com `BAAI/bge-reranker-base`
- [x] implementar `loader.py` para prompts versionados
- [x] implementar schemas Pydantic v2 e exportacao para JSON Schema
- [x] implementar `repair.py`
- [x] implementar `trace_writer.py`
- [x] implementar `worker.py` com contrato de consumo e resposta

Documentacao detalhada desta etapa:

- [Implementacao da Parte 5](./parte-5-alteracoes.md)

#### Criterio de pronto

- qualquer agent novo consegue reutilizar a mesma base
- retrieval, rerank, validacao e tracing estao padronizados

### Parte 6 - Implementacao do `content_agent`

#### Objetivo

Gerar a primeira versao do conteudo usando contexto recuperado por usuario.

Status: concluido na implementacao atual, com `ContentStepHandler`, prompts versionados `v1` e `v2`, retrieval com `persona/knowledge/performance`, rerank top 20 -> top 5, validacao do schema global, persistencia de trace/custo e integracao do worker RabbitMQ.

#### Entregaveis

- handler do `content_agent`
- prompts `v1` e `v2`
- validacao Pydantic

#### Passos

- [x] montar query com `persona + topic + format + platform`
- [x] recuperar documentos com filtro por usuario e tipo
- [x] reranquear top 20 para top 5
- [x] montar blocos de contexto:
  - `persona_context`
  - `knowledge_context`
  - `performance_context` opcional
- [x] renderizar prompt versionado
- [x] chamar o LLM principal
- [x] validar saida contra o schema global
- [x] persistir trace e custo estimado
- [x] responder ao orchestrator com JSON valido e metadados tecnicos

#### Criterio de pronto

- o agent preenche `post.hook`, `post.body`, `post.cta` e `metadata`
- o retorno ja chega validado ou cai no repair loop

### Parte 7 - Implementacao do `review_agent`

#### Objetivo

Revisar a saida do `content_agent` sem mudar o objetivo do conteudo.

Status: concluido na implementacao atual, com `ReviewStepHandler`, prompts versionados `v1` e `v2`, consumo do documento consolidado, retrieval com `persona/knowledge/performance`, rerank top 20 -> top 5, validacao do schema global, persistencia de trace/custo e integracao do worker RabbitMQ.

#### Entregaveis

- handler do `review_agent`
- prompts `v1` e `v2`
- regras de revisao por formato e plataforma

#### Passos

- [x] montar query com criterios de qualidade, plataforma e estilo
- [x] receber o documento global consolidado
- [x] recuperar contexto de revisao
- [x] aplicar rerank nos documentos recuperados
- [x] revisar clareza, formato e conformidade
- [x] devolver o documento inteiro no mesmo schema
- [x] validar a saida
- [x] persistir trace e custo estimado

#### Criterio de pronto

- o `review_agent` melhora a qualidade sem quebrar o contrato
- o resultado final continua aderente ao schema global versionado

### Parte 8 - Ingestao de `performance_memory`

#### Objetivo

Incluir a memoria de performance no MVP sem expandir demais o retrieval inicial.

#### Entregaveis

- endpoint `POST /performance-events`
- persistencia de eventos de performance
- campo de controle no metadata

#### Passos

- [ ] criar endpoint autenticado de ingestao de performance
- [ ] persistir eventos com `user_id`, `generation_id`, `platform` e `metrics`
- [ ] definir formato minimo das metricas:
  - `likes`
  - `comments`
  - `shares`
  - `impressions`
  - `engagement_rate`
- [ ] preparar mapeamento futuro para `rag_documents`
- [ ] registrar em `metadata.performance_context_used` se houve uso dessa memoria

#### Criterio de pronto

- o sistema aceita eventos de performance
- a estrutura fica pronta para uso gradual em retrieval futuro

### Parte 9 - Prompt versioning

#### Objetivo

Versionar prompts desde a primeira entrega para permitir rastreabilidade real.

#### Entregaveis

- estrutura `prompts/<agent>/v1.jinja`
- estrutura `prompts/<agent>/v2.jinja`
- registro de versao em trace

#### Passos

- [ ] mover prompts para arquivos template
- [ ] padronizar secoes `system`, `instructions`, `context` e `output_schema`
- [ ] registrar `prompt_version` em toda chamada
- [ ] incluir `repair_v1.jinja`

#### Criterio de pronto

- nenhum prompt principal fica hardcoded
- toda geracao consegue ser auditada por versao de prompt

### Parte 10 - Repair loop

#### Objetivo

Garantir robustez contra JSON invalido ou campos obrigatorios vazios.

#### Entregaveis

- prompt de repair
- fluxo de ate 3 tentativas
- falha estruturada com auditoria

#### Passos

- [ ] validar a saida com Pydantic v2
- [ ] disparar repair para JSON invalido
- [ ] disparar repair para campos obrigatorios vazios
- [ ] usar `qwen2.5:3b` como modelo de repair
- [ ] revalidar a cada tentativa
- [ ] persistir o output bruto invalido
- [ ] marcar step como `failed` e enviar para DLQ apos 3 falhas

#### Criterio de pronto

- o sistema tenta corrigir automaticamente os erros recuperaveis
- quando falha, deixa rastros suficientes para reproduzir o problema

### Parte 11 - Tracing, custo e OpenTelemetry readiness

#### Objetivo

Fechar a observabilidade tecnica do MVP com dados suficientes para portfolio e evolucao operacional.

#### Entregaveis

- persistencia em `llm_traces`
- agregacao em `generation_costs`
- estrutura compativel com OpenTelemetry

#### Passos

- [ ] registrar:
  - `generation_id`
  - `step_name`
  - `agent_name`
  - `provider`
  - `model`
  - `prompt_version`
  - `prompt_text`
  - `retrieved_doc_ids`
  - `retrieved_docs_preview`
  - `tokens_in`
  - `tokens_out`
  - `latency_ms`
  - `cost_usd`
  - `output_json`
  - `error_json`
  - `created_at`
- [ ] atualizar `generation_costs` apos cada chamada
- [ ] incluir identificadores preparados para integracao com OpenTelemetry
- [ ] expor metricas de sucesso, repair e latencia em nivel de geracao e step

#### Criterio de pronto

- cada step deixa rastro tecnico completo
- o custo por geracao pode ser consultado diretamente

### Parte 12 - Integracao ponta a ponta e demo

#### Objetivo

Validar o fluxo completo com a arquitetura real do MVP.

#### Entregaveis

- demo funcional
- cenario de teste integrado
- evidencia de estados, traces e resultado final

#### Passos

- [ ] autenticar um usuario de teste
- [ ] criar uma geracao via `POST /generate-content`
- [ ] confirmar ACK com `generation_id`
- [ ] acompanhar `GET /generations/:id` ate `completed`
- [ ] confirmar `generation_steps` com `content` e `review`
- [ ] confirmar `llm_traces` com retrieval, prompt e custo
- [ ] confirmar `generation_costs`
- [ ] registrar pelo menos um `performance_event`
- [ ] montar um caso de demo para portfolio

#### Criterio de pronto

- uma request percorre todo o pipeline sem intervencao manual
- a base guarda historico completo da execucao

## 6. Ordem sugerida de execucao

### Bloco 1 - Fundacao

- [x] Parte 1 - Infra local e ambiente de execucao
- [x] Parte 2 - Banco, autenticacao e persistencia base
- [x] Parte 3 - Contrato global e endpoints do MVP

### Bloco 2 - Core do sistema

- [x] Parte 4 - Orchestrator NestJS
- [x] Parte 5 - Shared layer dos agents Python
- [x] Parte 6 - `content_agent`
- [x] Parte 7 - `review_agent`

### Bloco 3 - Robustez e memoria

- [ ] Parte 8 - Ingestao de `performance_memory`
- [ ] Parte 9 - Prompt versioning
- [ ] Parte 10 - Repair loop
- [ ] Parte 11 - Tracing, custo e OpenTelemetry readiness

### Bloco 4 - Validacao final

- [ ] Parte 12 - Integracao ponta a ponta e demo

## 7. Definition of Done do MVP

O MVP sera considerado concluido quando todos os pontos abaixo estiverem verdadeiros:

- [ ] `POST /generate-content` retorna `generation_id` e nao bloqueia esperando os agents
- [ ] `GET /generations/:id` expone status, resultado e erros estruturados
- [ ] existe autenticacao basica e isolamento por usuario
- [ ] o pipeline `content -> review` executa via RabbitMQ com RPC interno
- [ ] cada step tem retry de ate 3 tentativas e DLQ em caso de falha final
- [ ] `content_agent` e `review_agent` usam retrieval + rerank
- [ ] o schema global versionado e validado por Pydantic e pelo NestJS
- [ ] o repair loop tenta corrigir JSON invalido ou campos obrigatorios vazios
- [ ] `generation_steps` guarda entradas, saidas, tentativas e erros por step
- [ ] `llm_traces` guarda prompt, retrieval, tokens, custo, latencia e output
- [ ] `generation_costs` consolida o custo total da geracao
- [ ] `POST /performance-events` aceita e persiste eventos de performance
- [ ] prompts ficam versionados no repositorio

## 8. Backlog imediato apos o MVP

Quando o MVP estiver estavel, a evolucao recomendada e:

1. ativar uso forte de `performance_memory` no retrieval
2. adicionar `trend_agent`
3. adicionar `strategy_agent`
4. expandir o pipeline para `trend -> strategy -> content -> review`
5. adicionar `media_agent`
6. permitir pipeline livre no payload da request
7. adicionar busca hibrida e hardening operacional avancado
