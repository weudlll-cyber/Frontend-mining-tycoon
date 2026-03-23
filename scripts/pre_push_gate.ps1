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

function Run-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "`n==> $Name"
    $global:LASTEXITCODE = 0
    & $Action
    $exitCode = $LASTEXITCODE

    if ($null -ne $exitCode -and $exitCode -ne 0) {
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
    "SECURITY_AUDIT.md"
)

Run-Step -Name "Required docs present" -Action {
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

Run-Step -Name "ESLint" -Action { & npm run lint }
Run-Step -Name "Prettier format check" -Action { & npm run format:check }
Run-Step -Name "Vitest unit tests" -Action { & npm run test -- --run }
Run-Step -Name "Vitest coverage" -Action { & npm run test:coverage }
Run-Step -Name "Production build" -Action { & npm run build }
Run-Step -Name "npm audit (prod, high+)" -Action {
    & npm audit --omit=dev --audit-level=high
}

Write-Host "`nFrontend pre-push gate completed successfully."
