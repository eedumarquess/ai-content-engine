# Commits da worktree – ordem e assuntos

Ordem alinhada ao **plano de ação do MVP** (`docs/plano-de-acao-mvp.md`). Use o script `commit-worktree.ps1` para aplicar todos de uma vez, ou copie os comandos abaixo para fazer manualmente.

---

## 1. Contrato global e schemas v1 (Parte 3)

**Assunto:** Schema global versionado, request/response, validação (agents + orchestrator).

```powershell
git add agents/shared/contracts/generation_v1.py agents/tests/test_contracts.py orchestrator/src/contracts/contracts.service.ts orchestrator/src/contracts/contracts.service.test.ts orchestrator/src/contracts/generated/generation-document.v1.schema.json orchestrator/src/contracts/generated/generation-status.response.v1.schema.json
git commit -m "feat(contracts): schema global v1, request/response e validacao (agents + orchestrator)"
```

---

## 2. Endpoints generations (Parte 3/4)

**Assunto:** DTOs e testes para `POST /generate-content` e `GET /generations/:id`.

```powershell
git add orchestrator/src/generations/dto/api-error-response.dto.ts orchestrator/src/generations/dto/generate-content-request.dto.ts orchestrator/src/generations/generations.controller.test.ts orchestrator/src/generations/generations.service.test.ts
git commit -m "feat(generations): DTOs e testes para POST /generate-content e GET /generations/:id"
```

---

## 3. Documentação (plano de ação MVP e parte 3)

**Assunto:** Plano de ação do MVP, README e alterações da parte 3.

```powershell
git add docs/plano-de-acao-mvp.md docs/README.md docs/parte-3-alteracoes.md
git commit -m "docs: plano de acao MVP, README e alteracoes da parte 3"
```

---

## 4. Scripts (commit worktree)

**Assunto:** Script de commits da worktree e documentação.

```powershell
git add scripts/commit-worktree.ps1 scripts/COMMITS-WORKTREE.md
git commit -m "chore(scripts): script de commits da worktree e documentacao"
```

---

## Uso do script

- **Executar todos os commits:**  
  `.\scripts\commit-worktree.ps1`

- **Simular (não commitar):**  
  `$env:DRY_RUN="1"; .\scripts\commit-worktree.ps1`

Execute a partir da raiz do repositório.
