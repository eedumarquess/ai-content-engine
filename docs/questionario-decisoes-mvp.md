# Questionario de Decisoes do MVP

Arquivo consolidado com suas respostas e com recomendacoes tecnicas para fechar os pontos em aberto.

Convencao usada:

- `Resposta:` decisao consolidada
- `Observacao:` criterio, ajuste de escopo ou nota tecnica

## 1. Decisoes de corte rapido

Estas respostas definem a arquitetura base sem ambiguidade.

### 1.1 Tipo de resposta da API

Pergunta: O endpoint `POST /generate-content` deve responder com o resultado final na mesma request ou retornar um `generation_id` para consulta posterior?

Resposta: retornar `generation_id` para consulta posterior

Observacao: Como o core usa fila e workers, esse modelo reduz acoplamento com o frontend e evita segurar conexoes HTTP por muito tempo.

### 1.2 Fonte de verdade do schema

Pergunta: Qual camada sera a fonte de verdade do contrato de dados?

Opcoes:

- Pydantic no Python
- JSON Schema independente
- DTO/validation no NestJS

Resposta: Pydantic no Python

Observacao: O Pydantic v2 sera a fonte de verdade. A partir dele o sistema exporta JSON Schema, e o NestJS valida com base nesse contrato gerado.

### 1.3 Escopo real do MVP

Pergunta: O MVP e para portfolio, uso interno ou base de produto real?

Resposta: portfolio

Observacao: Isso justifica priorizar robustez tecnica, rastreabilidade e boa demonstracao arquitetural.

### 1.4 Multi-tenant

Pergunta: O sistema precisa suportar multiplos usuarios com isolamento de dados ja no MVP?

Resposta: sim, com autenticacao basica

Observacao: O isolamento deve ocorrer pelo menos em `users`, `generations`, `rag_documents` e memoria por usuario.

### 1.5 `performance_memory`

Pergunta: A memoria de performance entra funcional no MVP ou fica apenas preparada para depois?

Resposta: entra parcial no MVP

Observacao: Para manter o escopo controlado, `performance_memory` entra com persistencia e endpoint de ingestao. O uso forte no retrieval pode ficar desligado por padrao na v1.

### 1.6 Retry e DLQ

Pergunta: Retry automatico e DLQ entram no MVP ou ficam para a fase seguinte?

Resposta: entram no MVP

Observacao: Retry deve ser limitado por step e, ao exceder, a mensagem deve seguir para DLQ com contexto suficiente para analise.

### 1.7 Persistencia de prompt completo

Pergunta: Pode salvar o prompt completo e o contexto recuperado no banco?

Resposta: sim

Observacao: Isso fortalece a auditoria tecnica do portfolio e facilita debug.

## 2. Objetivo e restricoes do MVP

### 2.1 Meta principal

Pergunta: O que o MVP precisa provar para ser considerado sucesso?

Resposta: geracao consistente de conteudo com rastreabilidade tecnica e metricas operacionais confiaveis

Observacao: As metricas minimas confiaveis para o MVP serao `success_rate`, `latency_por_step`, `latency_total`, `repair_rate`, `tokens_por_geracao`, `cost_por_geracao` e `schema_valid_first_pass_rate`.

### 2.2 Latencia aceitavel

Pergunta: Qual latencia maxima aceitavel por geracao no MVP?

Resposta: alvo de ate 120s por geracao completa

Observacao: Como a API devolvera `generation_id`, o ACK inicial deve sair em menos de 2s. O hard timeout continua em 5min por step.

### 2.3 Volume esperado

Pergunta: Quantas geracoes por dia e quantas simultaneas voce espera no MVP?

Resposta: ate 50 geracoes por dia e 2 execucoes simultaneas no MVP

Observacao: Base inicial de baixa concorrencia, com 2 workers e possibilidade de escalar horizontalmente depois.

### 2.4 Budget por geracao

Pergunta: Existe um teto de custo por request que precisa ser respeitado?

Resposta: sim, teto conceitual de ate 2 dolares por geracao

Observacao: Como a stack sera local com Ollama, o custo direto do MVP sera baixo, mas o sistema deve continuar calculando custo estimado para futura troca de provider.

## 3. Orquestracao centralizada no NestJS

### 3.1 Papel do orchestrator

Pergunta: O NestJS vai apenas coordenar os steps ou tambem sera responsavel por timeout, retry, idempotencia e consolidacao de estado?

Resposta: sera responsavel por tudo

Observacao: O NestJS e o cerebro da operacao. Os agents apenas recebem contexto, executam o step e retornam resultado.

### 3.2 Configuracao do pipeline

Pergunta: O pipeline sera configurado via codigo, banco ou payload da request?

Resposta: banco no MVP, referenciado pela request

Observacao: O frontend envia um identificador de pipeline ou preset. No futuro, a request podera montar o pipeline livremente.

### 3.3 Granularidade do estado

Pergunta: Voce quer armazenar apenas o status final da geracao ou o snapshot de cada step com `input_json` e `output_json`?

Resposta: snapshot de cada step com `input_json` e `output_json`

Observacao: Esse nivel de detalhe e necessario para replay, debug e portfolio.

### 3.4 Falha de step

Pergunta: Se `content` falhar ou `review` falhar, a geracao inteira deve falhar imediatamente?

Resposta: sim, apos esgotar retry o step vai para DLQ e a geracao fica como `failed`

Observacao: Isso preserva consistencia e evita retornar resultado parcial como se estivesse concluido.

## 4. RabbitMQ com RPC entre orchestrator e agentes

### 4.1 Modelo de comunicacao

Pergunta: Voce confirma RPC sobre RabbitMQ como modelo do MVP, em vez de job assincrono com polling?

Resposta: sim

Observacao: O orchestrator usa RPC com correlation id para cada step, enquanto a API externa continua assincrona via `generation_id`.

### 4.2 Timeout por step

Pergunta: Qual timeout por step deve ser adotado no MVP?

Resposta: ate 5 minutos por step

Observacao: Esse limite cobre execucao local em Ollama sem tornar o sistema permissivo demais.

### 4.3 Duplicacao de jobs

Pergunta: O sistema precisa ser tolerante a reprocessamento do mesmo step no MVP?

Resposta: sim

Observacao: Cada par `generation_id + step_name` deve ser idempotente.

### 4.4 Retry

Pergunta: Se um agent falhar por timeout ou erro transitivo, quantas tentativas devem ocorrer?

Resposta: ate 3 tentativas por step

Observacao: Se falhar nas 3, a mensagem segue para DLQ e a geracao e encerrada como falha.

### 4.5 Estrategia de resposta

Pergunta: O worker deve responder apenas com o JSON final validado ou tambem com metadados tecnicos do step?

Resposta: ambos

Observacao: O retorno do worker deve incluir `output_json` validado e metadados tecnicos minimos para persistencia de step e trace.

## 5. Vector store em Postgres + `pgvector`

### 5.1 Justificativa

Pergunta: A escolha por Postgres + `pgvector` e por simplicidade operacional, custo ou requisito tecnico?

Resposta: simplicidade operacional

Observacao: Boa escolha para MVP local, com menos moving parts e persistencia unificada.

### 5.2 Escala inicial

Pergunta: Quantos documentos voce espera armazenar no inicio?

Resposta: baixo volume inicial, ate 50 novos documentos por dia

Observacao: Esse volume e totalmente compativel com Postgres + `pgvector` no MVP.

### 5.3 Embeddings

Pergunta: Qual provider/model de embeddings voce quer usar no MVP?

Resposta: Ollama com `nomic-embed-text`

Observacao: Mantem o stack 100% local e e suficiente para um MVP de portfolio com `pgvector`.

### 5.4 Estrategia de retrieval

Pergunta: O retrieval sera apenas vetorial ou tambem precisa de filtros por `doc_type`, `platform`, `user_id` e tags?

Resposta: vetorial com filtros

Observacao: Filtros por `doc_type`, `platform`, `user_id` e tags devem entrar desde o MVP.

### 5.5 Busca hibrida

Pergunta: Ha necessidade de busca textual/hibrida no MVP ou apenas similaridade vetorial?

Resposta: apenas similaridade vetorial

Observacao: Busca hibrida pode ficar para uma iteracao posterior.

## 6. Memoria persistente: `persona`, `knowledge` e `performance`

### 6.1 Definicao por tipo

Pergunta: O que entra em cada uma destas memorias?

- `persona`: tone, topics, voice
- `knowledge`: frameworks, hooks, structures
- `performance`: post, likes, engagement

Resposta: essas tres memorias entram com esse recorte inicial

Observacao: O importante e manter contrato claro para cada tipo e permitir filtros no retrieval.

### 6.2 Origem dos dados

Pergunta: Quem cria e atualiza cada memoria no MVP?

Resposta: o proprio usuario envia os dados para analise via RAG

Observacao: Isso inclui documentos, referenciais de estilo e possivel base de design/content system.

### 6.3 Escopo da memoria

Pergunta: A memoria e global, por usuario, por marca ou por projeto?

Resposta: por usuario

Observacao: No futuro, voce pode adicionar recorte por workspace ou marca.

### 6.4 Prioridade entre contextos

Pergunta: Quando houver conflito entre `persona` e `knowledge`, qual deve prevalecer?

Resposta: `persona`

Observacao: A persona define a voz final; o knowledge orienta estrutura e fundamentos.

### 6.5 Performance no MVP

Pergunta: `performance` sera usada de verdade no retrieval do MVP ou apenas mantida como estrutura futura?

Resposta: estrutura preparada com ingestao ativa, mas retrieval opcional na v1

Observacao: Isso resolve o conflito de escopo e permite demonstrar a capacidade sem travar o MVP.

## 7. Pipeline configuravel com ordem fixa `content -> review`

### 7.1 Configurabilidade

Pergunta: A configuracao de pipeline e uma necessidade de produto ou apenas uma previsao arquitetural?

Resposta: previsao arquitetural

Observacao: No MVP, o pipeline operacional continua fixo em `content -> review`.

### 7.2 Entrada de cada step

Pergunta: Cada step recebe o output bruto do step anterior ou o documento global consolidado ate aquele ponto?

Resposta: documento global consolidado ate aquele ponto

Observacao: Isso simplifica validacao e reduz divergencia de contrato entre steps.

### 7.3 Papel do `review_agent`

Pergunta: O `review_agent` pode reescrever livremente ou so ajustar formato, clareza e conformidade?

Resposta: ajustar formato, clareza e conformidade

Observacao: O review melhora qualidade sem mudar o objetivo do conteudo.

### 7.4 Futuro do pipeline

Pergunta: No pos-MVP, voce quer permitir steps opcionais, reorder de steps ou ambos?

Resposta: ambos

Observacao: Isso reforca a necessidade de guardar definicao de pipeline em banco.

## 8. Saida estruturada por schema global

### 8.1 Strategy do schema

Pergunta: Voce quer um schema global unico para todos os agents ou schemas por step com um envelope comum?

Resposta: um schema global unico para todos os agents

Observacao: Cada agent preenche ou ajusta partes do mesmo documento.

### 8.2 Campos obrigatorios do MVP

Pergunta: Quais campos devem ser obrigatorios no MVP?

Resposta: `topic`, `post.hook`, `post.body`, `post.cta`, `metadata.platform`, `metadata.format`, `metadata.pipeline`, `metadata.generation_id` e `metadata.schema_version`

Observacao: Os objetos de topo `strategy` e `media` devem existir no JSON, mesmo quando vierem com campos vazios.

### 8.3 Campos tolerados como vazios

Pergunta: Quais campos podem vir `null`, vazios ou ausentes no MVP?

Resposta: `strategy.goal`, `strategy.angle`, `strategy.audience`, `media.image_prompt`, `media.carousel`, `media.video_prompt`, `metadata.persona_id` e `metadata.performance_context_used`

Observacao: Campos nao preenchidos no MVP devem vir como `null` ou lista vazia, nunca sumir do contrato se fizerem parte do schema global versionado.

### 8.4 Estrategia de retorno do review

Pergunta: O `review_agent` devolve o documento inteiro ou apenas alteracoes sobre o documento anterior?

Resposta: devolve o documento inteiro

Observacao: Isso simplifica validacao, persistencia e debug.

### 8.5 Versionamento do schema

Pergunta: O schema precisa ser versionado ja no MVP?

Resposta: sim

Observacao: O campo `metadata.schema_version` deve nascer ja na v1.

## 9. Validacao com Pydantic

### 9.1 Camada de validacao final

Pergunta: A validacao final acontece apenas nos agents ou tambem no NestJS antes de devolver ao cliente?

Resposta: tambem no NestJS antes de devolver ao cliente

Observacao: Validacao dupla melhora confiabilidade e protege a API.

### 9.2 Compartilhamento de contratos

Pergunta: Voce quer gerar JSON Schema a partir do Pydantic para reaproveitar no NestJS?

Resposta: sim

Observacao: Isso elimina drift de contrato entre Python e TypeScript.

### 9.3 Tratamento de erro

Pergunta: Como erros de validacao devem aparecer na API?

Resposta: em um array de erros no retorno da resposta

Observacao: O ideal e expor um formato estruturado como `errors: [{code, message, field, trace_id}]`.

### 9.4 Versao do Pydantic

Pergunta: Pydantic v2 esta aprovado como base do MVP?

Resposta: sim

Observacao: Mantem o stack atual e facilita exportacao de JSON Schema.

## 10. Repair loop obrigatorio

### 10.1 Regra de disparo

Pergunta: O repair deve rodar apenas para JSON invalido ou tambem para campos vazios, incoerentes ou fora do estilo esperado?

Resposta: JSON invalido e campos vazios

Observacao: Incoerencia semantica pode ficar para uma fase posterior, para nao inflar o repair loop no MVP.

### 10.2 Numero de tentativas

Pergunta: Quantas tentativas de repair devem existir no MVP?

Resposta: 3

Observacao: Apos a terceira falha, o step deve ser marcado como failed.

### 10.3 Modelo de repair

Pergunta: O repair usa o mesmo modelo principal ou um modelo mais barato?

Resposta: modelo mais barato

Observacao: Recomendacao pratica: `qwen2.5:3b` via Ollama para repair, mantendo o principal em `qwen2.5:7b`.

### 10.4 Falha definitiva

Pergunta: Se o repair falhar, a geracao inteira falha ou existe algum fallback?

Resposta: a geracao inteira falha

Observacao: O step deve ir para DLQ com o output bruto e o erro de validacao.

### 10.5 Auditoria

Pergunta: O output bruto invalido deve ser persistido para auditoria?

Resposta: sim

Observacao: Isso e importante para reproduzir falhas e mostrar robustez no portfolio.

## 11. Observabilidade customizada com persistencia

### 11.1 Dados obrigatorios

Pergunta: Quais campos sao obrigatorios em todo trace do MVP?

Resposta: `generation_id`, `step_name`, `agent_name`, `provider`, `model`, `prompt_version`, `prompt_text`, `retrieved_doc_ids`, `retrieved_docs_preview`, `tokens_in`, `tokens_out`, `latency_ms`, `cost_usd`, `output_json`, `error_json` e `created_at`

Observacao: Esses campos cobrem auditoria tecnica, custo, reproducibilidade e analise posterior de retrieval.

### 11.2 Nivel de tracing

Pergunta: O tracing deve existir apenas por chamada LLM ou tambem por retrieval e por step do pipeline?

Resposta: por retrieval e por step do pipeline

Observacao: Isso da mais valor tecnico do que um trace simplificado apenas por chamada.

### 11.3 Privacidade

Pergunta: Existe alguma restricao para armazenar contexto recuperado, outputs e prompts completos?

Resposta: nao

Observacao: Mesmo assim, vale prever mascaramento futuro para campos sensiveis.

### 11.4 Uso futuro

Pergunta: A observabilidade precisa nascer pronta para integracao futura com OpenTelemetry, Langfuse ou ferramenta similar?

Resposta: OpenTelemetry

Observacao: Estruture identificadores e eventos de forma compativel desde o inicio.

## 12. Stack e providers

### 12.1 LLM principal

Pergunta: Qual provider/model principal sera usado no MVP?

Resposta: Ollama com `qwen2.5:7b`

Observacao: Boa escolha local para geracao estruturada e portfolio.

### 12.2 LLM de fallback

Pergunta: Ja deve existir modelo de fallback no MVP?

Resposta: sim, Ollama com `qwen2.5:3b`

Observacao: Mantem compatibilidade de familia e reduz custo computacional no fallback/repair.

### 12.3 Reranking

Pergunta: O reranker sera um cross-encoder dedicado ou um prompt de rerank via LLM?

Resposta: cross-encoder dedicado local

Observacao: Recomendacao: `BAAI/bge-reranker-base`. E mais defensavel tecnicamente do que rerank via prompt e roda localmente.

### 12.4 Deploy local

Pergunta: O MVP deve rodar integralmente local com Docker ou pode depender de servicos externos pagos para LLM e embeddings?

Resposta: integralmente local com Docker

Observacao: Isso fecha coerentemente a escolha por Ollama e `pgvector`.

## 13. Resumo final das decisoes

- Modelo de resposta da API: assincrono com `generation_id` e consulta posterior do status/resultado
- Fonte de verdade do schema: Pydantic v2 no Python, com JSON Schema exportado para validacao no NestJS
- Multi-tenant no MVP: sim, com isolamento por usuario e autenticacao basica
- `performance_memory` no MVP: persistencia e ingestao ativas; uso no retrieval fica limitado ou opcional na v1
- Retry no MVP: sim, ate 3 tentativas por step
- DLQ no MVP: sim, para falhas definitivas de step
- Provider/model principal: Ollama com `qwen2.5:7b`
- Provider/model de embeddings: Ollama com `nomic-embed-text`
- Strategy do rerank: cross-encoder local `BAAI/bge-reranker-base`
- Prompt completo salvo no banco: sim
- Validacao final no NestJS: sim, alem da validacao nos agents
- Politica de repair: aciona para JSON invalido ou campos vazios, tenta ate 3 vezes com modelo mais barato e falha a geracao se nao recuperar
