# Commits da worktree – ordem e assuntos

Ordem por **assunto** e **dependência** (schemas → módulos → shared __init__ → testes → scripts). Use o script `commit-worktree.ps1` para aplicar todos de uma vez, ou copie os comandos abaixo para fazer manualmente.

---

## 1. Schemas shared v1

**Assunto:** Base da camada shared – tipos comuns, retrieval, trace, worker e schemas JSON gerados.

```powershell
git add agents/shared/schemas/__init__.py agents/shared/schemas/common.py agents/shared/schemas/retrieval_v1.py agents/shared/schemas/trace_v1.py agents/shared/schemas/worker_v1.py agents/shared/schemas/export_json_schemas.py agents/shared/schemas/generated/llm-trace-record.v1.schema.json agents/shared/schemas/generated/retrieval-filters.v1.schema.json agents/shared/schemas/generated/retrieved-document.v1.schema.json agents/shared/schemas/generated/step-rpc.failure-reply.v1.schema.json agents/shared/schemas/generated/step-rpc.request.v1.schema.json agents/shared/schemas/generated/step-rpc.success-reply.v1.schema.json
git commit -m "feat(agents): schemas shared v1 (common, retrieval, trace, worker, generated JSON)"
```

---

## 2. Dependências agents

**Assunto:** Dependências do projeto agents (pyproject.toml).

```powershell
git add agents/pyproject.toml
git commit -m "chore(agents): dependencias pyproject (aio-pika, httpx, jinja2, sentence-transformers, etc.)"
```

---

## 3. LLM client e pricing

**Assunto:** Cliente LLM shared e tabela de pricing.

```powershell
git add agents/shared/llm/__init__.py agents/shared/llm/client.py agents/shared/llm/pricing.py
git commit -m "feat(agents): shared LLM client e pricing"
```

---

## 4. RAG shared

**Assunto:** Embedder, retriever e reranker na camada shared.

```powershell
git add agents/shared/rag/__init__.py agents/shared/rag/embedder.py agents/shared/rag/retriever.py agents/shared/rag/reranker.py
git commit -m "feat(agents): shared RAG embedder, retriever e reranker"
```

---

## 5. Prompts shared e template repair

**Assunto:** Loader de prompts e template Jinja para repair.

```powershell
git add agents/shared/prompts/__init__.py agents/shared/prompts/loader.py agents/prompts/repair/repair_v1.jinja
git commit -m "feat(agents): prompt loader e template repair v1"
```

---

## 6. Repair service

**Assunto:** Serviço de validação e reparo de saída (retry com LLM).

```powershell
git add agents/shared/repair/__init__.py agents/shared/repair/repair.py
git commit -m "feat(agents): repair service para validacao e reparo de saida"
```

---

## 7. Rabbit RPC worker

**Assunto:** Worker RPC sobre RabbitMQ na camada shared.

```powershell
git add agents/shared/rabbit/__init__.py agents/shared/rabbit/worker.py
git commit -m "feat(agents): shared Rabbit RPC worker"
```

---

## 8. Tracing shared

**Assunto:** Escrita de traces (trace writer).

```powershell
git add agents/shared/tracing/__init__.py agents/shared/tracing/trace_writer.py
git commit -m "feat(agents): shared trace writer"
```

---

## 9. Shared __init__ exports

**Assunto:** `agents/shared/__init__.py` com exports da camada.

```powershell
git add agents/shared/__init__.py
git commit -m "feat(agents): shared __init__ com exports da camada"
```

---

## 10. Testes shared layer

**Assunto:** Testes da camada shared.

```powershell
git add agents/tests/test_shared_layer.py
git commit -m "test(agents): testes da camada shared"
```

---

## 11. Scripts worktree

**Assunto:** Script de commits da worktree e esta documentação.

```powershell
git add scripts/commit-worktree.ps1 scripts/COMMITS-WORKTREE.md
git commit -m "chore(scripts): script de commits da worktree por assunto e COMMITS-WORKTREE.md"
```

---

## Uso do script

- **Executar todos os commits (na ordem acima):**  
  `.\scripts\commit-worktree.ps1`

- **Simular (não commitar):**  
  `$env:DRY_RUN="1"; .\scripts\commit-worktree.ps1`

Execute a partir da **raiz do repositório**.
