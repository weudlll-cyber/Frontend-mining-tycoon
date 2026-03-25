<#
.SYNOPSIS
Enables the tracked git hooks for this frontend repo.

.EXAMPLE
& .\scripts\enable_git_hooks.ps1
#>

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

& git config core.hooksPath .githooks

Write-Host "Configured core.hooksPath=.githooks for frontend repo."
