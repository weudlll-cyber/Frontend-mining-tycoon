<#
File: scripts/dev_all_stop.ps1
Purpose: Stop the background frontend dev server and backend API started by
scripts/dev_all_start.ps1.

.PARAMETER BackendPath
Path to the backend repository. Defaults to the sibling folder "Mining tycoon".

.EXAMPLE
& .\scripts\dev_all_stop.ps1
#>

param(
    [string]$BackendPath = ""
)

$frontendRoot = Split-Path -Parent $PSScriptRoot
if (-not $BackendPath) {
    $BackendPath = Join-Path (Split-Path -Parent $frontendRoot) "Mining tycoon"
}

Write-Host "==> Frontend" -ForegroundColor Cyan
Push-Location $frontendRoot
try { & (Join-Path $PSScriptRoot "dev_frontend_stop.ps1") } finally { Pop-Location }

Write-Host "==> Backend" -ForegroundColor Cyan
$backendStop = Join-Path $BackendPath "scripts\dev_stop.ps1"
if (Test-Path $backendStop) {
    Push-Location $BackendPath
    try { & $backendStop } finally { Pop-Location }
}
else {
    Write-Warning "Backend stop script not found: $backendStop (use -BackendPath)."
}
