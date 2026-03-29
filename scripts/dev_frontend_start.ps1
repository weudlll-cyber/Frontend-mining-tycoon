<#
.SYNOPSIS
Starts the frontend Vite dev server in a detached process with PID/log tracking.

.DESCRIPTION
Runs `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` from the project root,
records process metadata to `data/frontend_dev_process.json`, and writes stdout/stderr logs.

.PARAMETER StateFile
Optional path to the process state file. Defaults to data\frontend_dev_process.json.

.PARAMETER BindHost
Frontend host binding. Defaults to 127.0.0.1.

.PARAMETER Port
Frontend port. Defaults to 5173.

.EXAMPLE
./scripts/dev_frontend_start.ps1
#>

param(
    [string]$StateFile = "",
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not $StateFile) {
    $StateFile = Join-Path $projectRoot "data\frontend_dev_process.json"
}

$stateDir = Split-Path -Parent $StateFile
if (-not (Test-Path $stateDir)) {
    New-Item -ItemType Directory -Path $stateDir | Out-Null
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
        return [string]$proc.CommandLine
    }
    catch {
        return ""
    }
}

function Try-AdoptExistingListener {
    param(
        [string]$BindHost,
        [int]$BindPort,
        [string]$OutLogPath,
        [string]$ErrLogPath,
        [string]$StatePath,
        [string]$ProjectRootPath
    )

    $listeners = @()
    try {
        $listeners = @(Get-NetTCPConnection -LocalAddress $BindHost -LocalPort $BindPort -State Listen -ErrorAction SilentlyContinue)
    }
    catch {
        $listeners = @()
    }

    foreach ($listener in $listeners) {
        $procId = [int]$listener.OwningProcess
        if ($procId -le 0) {
            continue
        }
        $cmd = Get-ProcessCommandLine -ProcessId $procId
        if ($cmd -like "*vite*" -or $cmd -like "*npm*run dev*") {
            $state = [pscustomobject]@{
                project_root = $ProjectRootPath
                host = $BindHost
                port = $BindPort
                started_at = (Get-Date).ToString("o")
                pid = $procId
                marker = "vite --host $BindHost --port $BindPort"
                stdout_log = $OutLogPath
                stderr_log = $ErrLogPath
            }
            $state | ConvertTo-Json -Depth 4 | Set-Content -Path $StatePath -Encoding UTF8
            Write-Host "Adopted existing frontend dev server on PID $procId"
            Write-Host "URL: http://$BindHost`:$BindPort/"
            Write-Host "State file: $StatePath"
            return $true
        }
    }

    return $false
}

if (Test-Path $StateFile) {
    try {
        $existing = Get-Content -Path $StateFile -Raw | ConvertFrom-Json
        $existingPid = [int]$existing.pid
        if ($existingPid -gt 0) {
            $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
            if ($proc) {
                $cmd = Get-ProcessCommandLine -ProcessId $existingPid
                if ($cmd -like "*vite*" -and $cmd -like "*--port $Port*") {
                    Write-Host "Frontend dev server already running on PID $existingPid"
                    Write-Host "URL: http://$BindHost`:$Port/"
                    exit 0
                }
            }
        }
    }
    catch {
        # Ignore malformed state and continue with fresh start.
    }
}

$outLog = Join-Path $stateDir "frontend_dev_stdout.log"
$errLog = Join-Path $stateDir "frontend_dev_stderr.log"

if (Try-AdoptExistingListener -BindHost $BindHost -BindPort $Port -OutLogPath $outLog -ErrLogPath $errLog -StatePath $StateFile -ProjectRootPath $projectRoot) {
    exit 0
}

if (Test-Path $outLog) { Remove-Item -Path $outLog -Force }
if (Test-Path $errLog) { Remove-Item -Path $errLog -Force }

$npmCommand = "npm run dev -- --host $BindHost --port $Port --strictPort"
$proc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", $npmCommand `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

Start-Sleep -Seconds 2

$listenerCount = 0
try {
    $listenerCount = @(Get-NetTCPConnection -LocalAddress $BindHost -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count
}
catch {
    $listenerCount = 0
}

$state = [pscustomobject]@{
    project_root = $projectRoot
    host = $BindHost
    port = $Port
    started_at = (Get-Date).ToString("o")
    pid = $proc.Id
    marker = "vite --host $BindHost --port $Port"
    stdout_log = $outLog
    stderr_log = $errLog
}

$state | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile -Encoding UTF8

if ($listenerCount -gt 0) {
    Write-Host "Frontend dev server started."
    Write-Host "URL: http://$BindHost`:$Port/"
}
else {
    Write-Warning "Process started but port $Port is not listening yet. Check logs:"
    Write-Host "  $outLog"
    Write-Host "  $errLog"
}

Write-Host "State file: $StateFile"
