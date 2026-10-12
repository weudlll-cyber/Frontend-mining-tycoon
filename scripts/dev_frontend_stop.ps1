<#
.SYNOPSIS
Stops the tracked detached frontend Vite dev server process.

.DESCRIPTION
Reads `data/frontend_dev_process.json`, verifies process marker hints, terminates
with CIM Terminate, and removes the state file when stopped.

.PARAMETER StateFile
Optional path to process state file. Defaults to data\frontend_dev_process.json.

.EXAMPLE
./scripts/dev_frontend_stop.ps1
#>

param(
    [string]$StateFile = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $StateFile) {
    $StateFile = Join-Path $projectRoot "data\frontend_dev_process.json"
}

if (-not (Test-Path $StateFile)) {
    Write-Host "No frontend state file found at $StateFile"
    Write-Host "Nothing to stop."
    exit 0
}

$state = Get-Content -Path $StateFile -Raw | ConvertFrom-Json
$procId = [int]$state.pid
$expectedPort = [int]$state.port

if ($procId -le 0) {
    Write-Warning "State file did not include a valid pid. Removing stale state file."
    Remove-Item -Path $StateFile -Force
    exit 0
}

$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Host "Frontend PID $procId already stopped."
    Remove-Item -Path $StateFile -Force
    exit 0
}

$cmdLine = ""
try {
    $procCim = Get-CimInstance Win32_Process -Filter "ProcessId = $procId"
    $cmdLine = [string]$procCim.CommandLine
}
catch {
    $cmdLine = ""
}

# dev_frontend_start.ps1 tracks the `cmd.exe /c npm run dev ...` wrapper; an
# adopted listener is the vite node process itself. Accept both.
$looksLikeDevServer = ($cmdLine -like "*vite*") -or ($cmdLine -like "*npm run dev*")
if ($cmdLine -and (-not $looksLikeDevServer -or ($expectedPort -gt 0 -and $cmdLine -notlike "*--port $expectedPort*"))) {
    Write-Warning "PID $procId command line no longer matches expected vite command/port."
    Write-Warning "Skipping terminate for safety; keeping state file."
    exit 1
}

# The tracked PID is the cmd.exe wrapper; vite runs as its child node process.
# Terminating only the wrapper would leave vite running and holding the port,
# so stop the whole process tree.
& taskkill.exe /PID $procId /T /F *> $null
if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
    Write-Warning "Failed to terminate process tree of PID $procId."
    exit 1
}

Start-Sleep -Seconds 2
if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
    Write-Warning "Frontend PID $procId is still running."
    exit 1
}

# Safety net: if a vite process of THIS project still listens on the port
# (for example because the wrapper tree was broken), stop it as well.
if ($expectedPort -gt 0) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Get-NetTCPConnection -LocalPort $expectedPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $listenerCmd = [string](Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)").CommandLine
        if ($listenerCmd -like "*vite*" -and $listenerCmd -like "*$projectRoot*") {
            & taskkill.exe /PID $_.OwningProcess /T /F *> $null
        }
    }
}

Remove-Item -Path $StateFile -Force
Write-Host "Frontend dev server stopped and state file removed."
