<#
.SYNOPSIS
Deploy Mining Tycoon frontend to VPS (production artifacts only).

.DESCRIPTION
Builds the app and creates a minimal deployment package with only
production files - no tests, no dev dependencies, no git history.

Requires:
  - SSH credentials configured for your VPS
  - rsync installed on target VPS

Usage:
  .\scripts\deploy-to-vps.ps1 -VpsUser "myuser" -VpsHost "123.45.67.89" -VpsPath "/var/www/mining-tycoon"

.EXAMPLE
  .\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "my-vps.com" -VpsPath "/var/www/app"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$VpsUser,
    
    [Parameter(Mandatory=$true)]
    [string]$VpsHost,
    
    [Parameter(Mandatory=$true)]
    [string]$VpsPath,
    
    [string]$SshKey = $null,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "==> Mining Tycoon VPS Deployment" -ForegroundColor Green
Write-Host ""

# Step 1: Clean and build
Write-Host "Building production bundle..." -ForegroundColor Cyan
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

npm run build 2>&1 | Out-Null

if (-not (Test-Path "dist")) {
    throw "Build failed - dist/ not created"
}

Write-Host "✓ Build complete" -ForegroundColor Green

# Step 2: Create deployment manifest
Write-Host "Creating deployment package..." -ForegroundColor Cyan

$deploymentFiles = @(
    "dist/*",
    "public/*",
    "index.html"
)

$excludePatterns = @(
    "src/",
    "scripts/",
    "node_modules/",
    ".git/",
    ".venv/",
    "coverage/",
    "*.test.js",
    "*.config.js",
    "*.config.mjs",
    "*.md",
    ".github/",
    ".githooks/",
    ".vscode/",
    ".env*",
    "*.lock",
    ".prettierrc.json"
)

$rsyncExcludes = ($excludePatterns | ForEach-Object { "--exclude='$_'" }) -join " "

# Step 3: Build rsync command
$sshOpt = ""
if ($SshKey) {
    $sshOpt = "-e 'ssh -i $SshKey'"
}

$rsyncCmd = "rsync -avz --delete $sshOpt $rsyncExcludes `"$projectRoot/`" `"${VpsUser}@${VpsHost}:${VpsPath}/`""

Write-Host "Files to sync:" -ForegroundColor Cyan
@(
    "dist/ (compiled app)",
    "public/ (assets)",
    "index.html (entry point)"
) | ForEach-Object { Write-Host "  - $_" }

Write-Host ""
Write-Host "Excluded (not synced):" -ForegroundColor Yellow
$excludePatterns | ForEach-Object { Write-Host "  - $_" }

if ($DryRun) {
    Write-Host ""
    Write-Host "DRY RUN - Command preview:" -ForegroundColor Yellow
    Write-Host $rsyncCmd
    return
}

Write-Host ""
Write-Host "Syncing to VPS..." -ForegroundColor Cyan
Write-Host "Target: ${VpsUser}@${VpsHost}:${VpsPath}/" -ForegroundColor Cyan
Write-Host ""

Invoke-Expression $rsyncCmd

Write-Host ""
Write-Host "✓ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. SSH into VPS: ssh ${VpsUser}@${VpsHost}"
Write-Host "2. Configure web server (nginx/apache) to serve ${VpsPath}/"
Write-Host "3. Set your backend URL in the app settings"
Write-Host ""
Write-Host "Quick nginx config:" -ForegroundColor Cyan
Write-Host @"
server {
    listen 80;
    server_name your-domain.com;
    root $VpsPath;
    index index.html;
    
    location / {
        try_files \$uri /index.html;
    }
    
    location ~* \.(js|css|svg|png|jpg|gif)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
"@
