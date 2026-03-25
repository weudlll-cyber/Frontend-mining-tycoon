<#
.SYNOPSIS
Runs the frontend push gate, prints a push summary, and pushes the current branch.

.EXAMPLE
& .\scripts\push_with_audit.ps1
#>

param(
    [string]$Remote = "origin",
    [string]$Branch,
    [switch]$SkipAudit,
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$currentBranch = if ($Branch) {
    $Branch
} else {
    (& git rev-parse --abbrev-ref HEAD).Trim()
}

if (-not $AllowDirty) {
    $status = & git status --short
    if ($status) {
        throw "Working tree is not clean. Commit or stash changes before audited push, or rerun with -AllowDirty."
    }
}

if (-not $SkipAudit) {
    & (Join-Path $PSScriptRoot "pre_push_gate.ps1")
}

$upstream = & git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" 2>$null
$hasUpstream = $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace("$upstream")

if ($hasUpstream) {
    $upstream = "$upstream".Trim()
}

Write-Host "`n==> Push summary"
Write-Host "Branch: $currentBranch"
Write-Host "Remote: $Remote"

if ($hasUpstream) {
    $range = "$upstream..HEAD"
    $aheadCount = [int]((& git rev-list --count $range).Trim())
    Write-Host "Upstream: $upstream"
    Write-Host "Commits ahead: $aheadCount"

    if ($aheadCount -eq 0) {
        Write-Host "No local commits ahead of upstream. Nothing to push."
        return
    }

    Write-Host "`nCommits to push:"
    & git log --oneline $range

    Write-Host "`nChanged files summary:"
    & git diff --stat $range

    & git push $Remote $currentBranch
}
else {
    Write-Host "Upstream: not configured"
    Write-Host "`nRecent commits on current branch:"
    & git log --oneline -10

    Write-Host "`nPushing and setting upstream..."
    & git push -u $Remote $currentBranch
}

Write-Host "`nFrontend push completed successfully."
