# AI Content Engine

Repositorio base do MVP do AI Content Engine.

## Documentacao

- [Indice da documentacao](./docs/README.md)
- [Infra local](./docs/infra-local.md)
- [Alteracoes implementadas na Parte 1](./docs/parte-1-alteracoes.md)

## Estrutura principal

- `orchestrator/`: scaffold minimo do servico NestJS
- `agents/`: scaffold minimo dos workers Python
- `infra/`: bootstrap de Postgres, RabbitMQ, Ollama e reranker
- `docs/`: documentacao consolidada do projeto

## Bootstrap de banco

- O fluxo local agora inclui o servico one-shot `db-bootstrap`
- Ele aplica migrations, seeda o admin bootstrap, gera embeddings reais para `persona` e `knowledge` e verifica a integridade do schema
- O preset global `content_review_v1` nasce com o UUID fixo `c7d7f8a1-5e54-4fb3-9a9a-0c0a9fd0f7d1`
