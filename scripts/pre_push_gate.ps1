<#
.SYNOPSIS
Runs the frontend pre-push quality gate.

.DESCRIPTION
Verifies core documentation is present and then runs the local quality and
security checks that must pass before pushing the frontend branch.

.EXAMPLE
& .\scripts\pre_push_gate.ps1
#>

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

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
Invoke-Step -Name "Vitest coverage" -Action { & npm run test:coverage }
Invoke-Step -Name "Production build" -Action { & npm run build }
Invoke-Step -Name "npm audit (prod, high+)" -Action {
    & npm audit --omit=dev --audit-level=high
}
Invoke-Step -Name "Code health audit (advisory)" -Action {
    & (Join-Path $PSScriptRoot "code_health_audit.ps1")
} -WarningOnly

Write-Host "`nFrontend pre-push gate completed successfully."

