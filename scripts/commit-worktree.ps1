# Script de commits da worktree - AI Content Engine
# Ordem por assunto e dependência: schemas -> módulos -> shared __init__ -> testes -> scripts
# Executa commits separados por assunto, na sequência recomendada.
#
# Uso: .\scripts\commit-worktree.ps1
# Uso (dry-run, só mostra o que seria feito): $env:DRY_RUN="1"; .\scripts\commit-worktree.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $root

$isDryRun = [bool]($env:DRY_RUN -eq "1")

function Invoke-Commit {
    param(
        [string]$Subject,
        [string[]]$Paths,
        [string]$Message
    )
    $existing = @()
    foreach ($p in $Paths) {
        if (Test-Path $p) { $existing += $p }
    }
    if ($existing.Count -eq 0) {
        Write-Host "[SKIP] Nenhum arquivo encontrado para: $Subject" -ForegroundColor Yellow
        return
    }
    Write-Host "`n--- $Subject ---" -ForegroundColor Cyan
    Write-Host "Arquivos: $($existing -join ', ')"
    if ($isDryRun) {
        Write-Host "[DRY-RUN] git add ... ; git commit -m ..." -ForegroundColor DarkGray
        return
    }
    git add $existing
    git commit -m $Message
}

# ---------------------------------------------------------------------------
# 1. Schemas (base da camada shared – tipos, JSON e export)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Schemas shared v1" -Message "feat(agents): schemas shared v1 (common, retrieval, trace, worker, generated JSON)" -Paths @(
    "agents/shared/schemas/__init__.py",
    "agents/shared/schemas/common.py",
    "agents/shared/schemas/retrieval_v1.py",
    "agents/shared/schemas/trace_v1.py",
    "agents/shared/schemas/worker_v1.py",
    "agents/shared/schemas/export_json_schemas.py",
    "agents/shared/schemas/generated/llm-trace-record.v1.schema.json",
    "agents/shared/schemas/generated/retrieval-filters.v1.schema.json",
    "agents/shared/schemas/generated/retrieved-document.v1.schema.json",
    "agents/shared/schemas/generated/step-rpc.failure-reply.v1.schema.json",
    "agents/shared/schemas/generated/step-rpc.request.v1.schema.json",
    "agents/shared/schemas/generated/step-rpc.success-reply.v1.schema.json"
)

# ---------------------------------------------------------------------------
# 2. Dependências (pyproject agents)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Dependências agents" -Message "chore(agents): dependencias pyproject (aio-pika, httpx, jinja2, sentence-transformers, etc.)" -Paths @(
    "agents/pyproject.toml"
)

# ---------------------------------------------------------------------------
# 3. LLM (cliente e pricing)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "LLM client e pricing" -Message "feat(agents): shared LLM client e pricing" -Paths @(
    "agents/shared/llm/__init__.py",
    "agents/shared/llm/client.py",
    "agents/shared/llm/pricing.py"
)

# ---------------------------------------------------------------------------
# 4. RAG (embedder, retriever, reranker)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "RAG shared" -Message "feat(agents): shared RAG embedder, retriever e reranker" -Paths @(
    "agents/shared/rag/__init__.py",
    "agents/shared/rag/embedder.py",
    "agents/shared/rag/retriever.py",
    "agents/shared/rag/reranker.py"
)

# ---------------------------------------------------------------------------
# 5. Prompts (loader e template repair)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Prompts shared e template repair" -Message "feat(agents): prompt loader e template repair v1" -Paths @(
    "agents/shared/prompts/__init__.py",
    "agents/shared/prompts/loader.py",
    "agents/prompts/repair/repair_v1.jinja"
)

# ---------------------------------------------------------------------------
# 6. Repair (validação e reparo de saída)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Repair service" -Message "feat(agents): repair service para validacao e reparo de saida" -Paths @(
    "agents/shared/repair/__init__.py",
    "agents/shared/repair/repair.py"
)

# ---------------------------------------------------------------------------
# 7. Rabbit (worker RPC)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Rabbit RPC worker" -Message "feat(agents): shared Rabbit RPC worker" -Paths @(
    "agents/shared/rabbit/__init__.py",
    "agents/shared/rabbit/worker.py"
)

# ---------------------------------------------------------------------------
# 8. Tracing (trace writer)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Tracing shared" -Message "feat(agents): shared trace writer" -Paths @(
    "agents/shared/tracing/__init__.py",
    "agents/shared/tracing/trace_writer.py"
)

# ---------------------------------------------------------------------------
# 9. Shared __init__ (exports da camada shared)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Shared __init__ exports" -Message "feat(agents): shared __init__ com exports da camada" -Paths @(
    "agents/shared/__init__.py"
)

# ---------------------------------------------------------------------------
# 10. Testes shared layer
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Testes shared layer" -Message "test(agents): testes da camada shared" -Paths @(
    "agents/tests/test_shared_layer.py"
)

# ---------------------------------------------------------------------------
# 11. Scripts (este script e documentação)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Scripts worktree" -Message "chore(scripts): script de commits da worktree por assunto e COMMITS-WORKTREE.md" -Paths @(
    "scripts/commit-worktree.ps1",
    "scripts/COMMITS-WORKTREE.md"
)

# ---------------------------------------------------------------------------
if ($isDryRun) {
    Write-Host "`n[DRY-RUN] Nenhum commit foi feito. Execute sem DRY_RUN para aplicar." -ForegroundColor Green
} else {
    Write-Host "`nConcluido. Verifique com: git log --oneline -n 15" -ForegroundColor Green
}
