<#
.SYNOPSIS
Runs the frontend pre-push quality gate.

.DESCRIPTION
Verifies core documentation is present and then runs the local quality and
security checks that must pass before pushing the frontend branch.

.EXAMPLE
& .\scripts\pre_push_gate.ps1
#>

param(
    [switch]$Force,
    [Alias("Profile")][ValidateSet("fast", "full")][string]$GateProfile = "fast"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$gitDir = (& git rev-parse --git-dir).Trim()
$gateCacheDir = Join-Path $gitDir "gate-cache"
$gateCachePath = Join-Path $gateCacheDir "frontend-pre-push-$GateProfile.json"

function Get-CurrentGateFingerprint {
    $head = (& git rev-parse HEAD).Trim()
    $tree = (& git rev-parse "HEAD^{tree}").Trim()
    return [pscustomobject]@{
        Head = $head
        Tree = $tree
    }
}

function Test-CleanWorkingTree {
    $status = & git status --porcelain
    return [string]::IsNullOrWhiteSpace(($status -join "`n"))
}

function Get-GateCache {
    if (-not (Test-Path $gateCachePath)) {
        return $null
    }

    try {
        return Get-Content $gateCachePath -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Save-GateCache {
    if (-not (Test-CleanWorkingTree)) {
        return
    }

    $fingerprint = Get-CurrentGateFingerprint
    $cachePayload = [pscustomobject]@{
        head = $fingerprint.Head
        tree = $fingerprint.Tree
        passedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    }

    if (-not (Test-Path $gateCacheDir)) {
        New-Item -ItemType Directory -Path $gateCacheDir | Out-Null
    }

    $cachePayload | ConvertTo-Json | Set-Content $gateCachePath
}

function Test-CanSkipGate {
    if ($Force -or -not (Test-CleanWorkingTree)) {
        return $false
    }

    $cache = Get-GateCache
    if ($null -eq $cache) {
        return $false
    }

    $fingerprint = Get-CurrentGateFingerprint
    return $cache.head -eq $fingerprint.Head -and $cache.tree -eq $fingerprint.Tree
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [switch]$WarningOnly
    )

    Write-Host "`n==> $Name"
    $global:LASTEXITCODE = 0
    & $Action
    $exitCode = $LASTEXITCODE

    if ($null -ne $exitCode -and $exitCode -ne 0) {
        if ($WarningOnly) {
            Write-Warning "NON-BLOCKING: $Name failed (exit $exitCode)."
            return
        }
        throw "FAILED: $Name (exit $exitCode)"
    }

    Write-Host "PASS: $Name"
}

if (Test-CanSkipGate) {
    $cache = Get-GateCache
    Write-Host "Frontend pre-push gate ($GateProfile) already passed for this clean HEAD at $($cache.passedAtUtc). Skipping rerun."
    return
}

Write-Host "Running frontend pre-push gate profile: $GateProfile"

$requiredDocs = @(
    "README.md",
    "PROJECT_BASELINE.md",
    "CONTRIBUTING.md",
    "LOCKED_DECISIONS.md",
    "SEASONAL_TYCOON_CONCEPT.md",
    "CODE_ORGANIZATION.md",
    "SECURITY.md"
)

Invoke-Step -Name "Required docs present" -Action {
    foreach ($doc in $requiredDocs) {
        if (-not (Test-Path $doc)) {
            throw "Missing required doc: $doc"
        }
        $lineCount = (Get-Content $doc | Measure-Object -Line).Lines
        if ($lineCount -le 0) {
            throw "Required doc is empty: $doc"
        }
    }
}

Invoke-Step -Name "ESLint" -Action { & npm run lint }
Invoke-Step -Name "Prettier format check" -Action { & npm run format:check }
Invoke-Step -Name "Vitest unit tests" -Action { & npm run test -- --run }
Invoke-Step -Name "Production build" -Action { & npm run build }

if ($GateProfile -eq "full") {
    Invoke-Step -Name "Vitest coverage" -Action { & npm run test:coverage }
    Invoke-Step -Name "npm audit (prod, high+)" -Action {
        & npm audit --omit=dev --audit-level=high
    }
    Invoke-Step -Name "Code health audit (advisory)" -Action {
        & (Join-Path $PSScriptRoot "code_health_audit.ps1")
    } -WarningOnly
}

Save-GateCache

Write-Host "`nFrontend pre-push gate ($GateProfile) completed successfully."

