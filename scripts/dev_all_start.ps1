<#
File: scripts/dev_all_start.ps1
Purpose: Start the local backend API and the frontend dev server together, both
hidden in the background (no console windows need to stay open).

.DESCRIPTION
Runs the backend repo's scripts/dev_start.ps1 (API on http://127.0.0.1:8000,
logs in <backend>/data/api_*.log) and this repo's scripts/dev_frontend_start.ps1
(Vite on http://127.0.0.1:5273, logs in data/frontend_dev_*.log), then waits
until both answer. Already running servers are reused. Stop both with
scripts/dev_all_stop.ps1.

.PARAMETER BackendPath
Path to the backend repository. Defaults to the sibling folder "Mining tycoon".

.EXAMPLE
& .\scripts\dev_all_start.ps1
#>

param(
    [string]$BackendPath = ""
)

$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $PSScriptRoot
if (-not $BackendPath) {
    $BackendPath = Join-Path (Split-Path -Parent $frontendRoot) "Mining tycoon"
}
$backendStart = Join-Path $BackendPath "scripts\dev_start.ps1"
if (-not (Test-Path $backendStart)) {
    throw "Backend start script not found: $backendStart (use -BackendPath)."
}

function Wait-ForUrl {
    param([string]$Url, [int]$TimeoutSeconds)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

Write-Host "==> Backend" -ForegroundColor Cyan
# Run the child scripts in this session (not via a piped child powershell): the
# servers they start would inherit the pipe and keep this script waiting.
Push-Location $BackendPath
try { & $backendStart } finally { Pop-Location }
if (-not (Wait-ForUrl -Url "http://127.0.0.1:8000/health/ready" -TimeoutSeconds 60)) {
    Write-Warning "Backend did not become ready. Logs: $(Join-Path $BackendPath 'data\api_stderr.log')"
    exit 1
}

Write-Host "==> Frontend" -ForegroundColor Cyan
Push-Location $frontendRoot
try { & (Join-Path $PSScriptRoot "dev_frontend_start.ps1") } finally { Pop-Location }
if (-not (Wait-ForUrl -Url "http://127.0.0.1:5273/" -TimeoutSeconds 60)) {
    Write-Warning "Frontend did not start. Logs: $(Join-Path $frontendRoot 'data\frontend_dev_stderr.log')"
    exit 1
}

Write-Host ""
Write-Host "Mining Tycoon is running in the background:" -ForegroundColor Green
Write-Host "  Lobby: http://127.0.0.1:5273/"
Write-Host "  Admin: http://127.0.0.1:5273/admin.html"
Write-Host "  API:   http://127.0.0.1:8000"
Write-Host "Stop with: & .\scripts\dev_all_stop.ps1"
