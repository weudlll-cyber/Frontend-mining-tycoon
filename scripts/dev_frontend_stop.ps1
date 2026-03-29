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

if ($cmdLine -and ($cmdLine -notlike "*vite*" -or ($expectedPort -gt 0 -and $cmdLine -notlike "*--port $expectedPort*"))) {
    Write-Warning "PID $procId command line no longer matches expected vite command/port."
    Write-Warning "Skipping terminate for safety; keeping state file."
    exit 1
}

try {
    if ($procCim) {
        $null = Invoke-CimMethod -InputObject $procCim -MethodName Terminate
    }
}
catch {
    Write-Warning "Failed to terminate PID $procId via CIM."
    exit 1
}

Start-Sleep -Seconds 2
if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
    Write-Warning "Frontend PID $procId is still running."
    exit 1
}

Remove-Item -Path $StateFile -Force
Write-Host "Frontend dev server stopped and state file removed."
