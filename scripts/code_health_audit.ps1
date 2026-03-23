<#
.SYNOPSIS
Runs a structural code-health audit for the frontend repo.

.DESCRIPTION
Reports large source/test files, missing top-of-file comments, TODO/FIXME markers,
and debug-console usage in source files. This audit is advisory by default so it
can guide refactors without blocking all work immediately.

.EXAMPLE
& .\scripts\code_health_audit.ps1
#>

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$sourceFiles = @(Get-ChildItem -Path "$projectRoot\src" -Recurse -File -Filter *.js)
$sourceThreshold = 450
$testThreshold = 650
$advisoryIssues = @()

function Add-Issue {
    param([string]$Message)
    $script:advisoryIssues += $Message
}

function Get-FirstMeaningfulLine {
    param([string[]]$Lines)
    foreach ($line in $Lines) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            return $line.Trim()
        }
    }
    return ""
}

Write-Host "==> Frontend code health audit"

foreach ($file in $sourceFiles) {
    $content = Get-Content $file.FullName
    $lineCount = $content.Count
    $relativePath = $file.FullName.Substring($projectRoot.Length + 1).Replace("\", "/")
    $threshold = if ($relativePath -like "*.test.js") { $testThreshold } else { $sourceThreshold }

    if ($lineCount -gt $threshold) {
        Add-Issue "Large file: $relativePath ($lineCount lines; threshold $threshold)"
    }

    $firstLine = Get-FirstMeaningfulLine -Lines $content
    if ($firstLine -and -not ($firstLine.StartsWith("/**") -or $firstLine.StartsWith("//"))) {
        Add-Issue "Missing top-of-file comment header: $relativePath"
    }
}

$todoMatches = Select-String -Path "$projectRoot\src\**\*.js" -Pattern "TODO|FIXME" -SimpleMatch:$false -ErrorAction SilentlyContinue
foreach ($match in $todoMatches) {
    Add-Issue "TODO/FIXME marker: $($match.Path.Substring($projectRoot.Length + 1).Replace("\", "/")):$($match.LineNumber)"
}

$debugMatches = Select-String -Path "$projectRoot\src\**\*.js" -Pattern "console\.(log|debug)" -ErrorAction SilentlyContinue
foreach ($match in $debugMatches) {
    $rel = $match.Path.Substring($projectRoot.Length + 1).Replace("\", "/")
    if ($rel -ne "src/utils/debug-log.js") {
        Add-Issue "Debug console usage: ${rel}:$($match.LineNumber)"
    }
}

$largestFiles = $sourceFiles |
    ForEach-Object {
        [PSCustomObject]@{
            Lines = (Get-Content $_.FullName | Measure-Object -Line).Lines
            File = $_.FullName.Substring($projectRoot.Length + 1).Replace("\", "/")
        }
    } |
    Sort-Object Lines -Descending |
    Select-Object -First 10

Write-Host "Largest frontend JS files:"
$largestFiles | Format-Table -AutoSize

if ($advisoryIssues.Count -gt 0) {
    Write-Warning "Frontend code health audit found advisory issues:"
    foreach ($issue in $advisoryIssues) {
        Write-Warning "- $issue"
    }
}
else {
    Write-Host "No advisory code health issues found."
}

Write-Host "Frontend code health audit completed."
