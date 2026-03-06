# Script de commits da worktree - AI Content Engine MVP
# Ordem alinhada ao plano de acao (docs/plano-de-acao-mvp.md)
# Executa commits separados por assunto, na sequencia recomendada.
#
# Uso: .\scripts\commit-worktree.ps1
# Uso (dry-run, so mostra o que seria feito): $env:DRY_RUN="1"; .\scripts\commit-worktree.ps1

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
# 1. Contrato global (Parte 3 - schema versionado, request/response)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Contrato global e schemas v1" -Message "feat(contracts): schema global v1, request/response e validacao (agents + orchestrator)" -Paths @(
    "agents/shared/contracts/generation_v1.py",
    "agents/tests/test_contracts.py",
    "orchestrator/src/contracts/contracts.service.ts",
    "orchestrator/src/contracts/contracts.service.test.ts",
    "orchestrator/src/contracts/generated/generation-document.v1.schema.json",
    "orchestrator/src/contracts/generated/generation-status.response.v1.schema.json"
)

# ---------------------------------------------------------------------------
# 2. API Generations (Parte 3/4 - DTOs e testes)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Endpoints generations" -Message "feat(generations): DTOs e testes para POST /generate-content e GET /generations/:id" -Paths @(
    "orchestrator/src/generations/dto/api-error-response.dto.ts",
    "orchestrator/src/generations/dto/generate-content-request.dto.ts",
    "orchestrator/src/generations/generations.controller.test.ts",
    "orchestrator/src/generations/generations.service.test.ts"
)

# ---------------------------------------------------------------------------
# 3. Documentacao (plano de acao MVP e parte 3)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Documentacao" -Message "docs: plano de acao MVP, README e alteracoes da parte 3" -Paths @(
    "docs/plano-de-acao-mvp.md",
    "docs/README.md",
    "docs/parte-3-alteracoes.md"
)

# ---------------------------------------------------------------------------
# 4. Scripts (commit worktree)
# ---------------------------------------------------------------------------
Invoke-Commit -Subject "Scripts worktree" -Message "chore(scripts): script de commits da worktree e documentacao" -Paths @(
    "scripts/commit-worktree.ps1",
    "scripts/COMMITS-WORKTREE.md"
)

# ---------------------------------------------------------------------------
if ($isDryRun) {
    Write-Host "`n[DRY-RUN] Nenhum commit foi feito. Execute sem DRY_RUN para aplicar." -ForegroundColor Green
} else {
    Write-Host "`nConcluido. Verifique com: git log --oneline -n 10" -ForegroundColor Green
}
