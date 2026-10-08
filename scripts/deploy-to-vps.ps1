<#
.SYNOPSIS
Builds the Mining Tycoon frontend and deploys ONLY the built dist/ to a VPS.

.DESCRIPTION
1. Validates the parameters (the API base URL must be https unless
   -AllowInsecureHttp is given).
2. Runs `npm run build` with VITE_API_BASE_URL set, so the bundle talks to the
   production backend, and checks that the URL really ended up in the bundle.
3. Packs dist/ plus deploy/ (nginx template and server-side installer) with
   the Windows tar.exe, uploads it with scp and runs
   deploy/remote/install-frontend.sh on the server via `sudo -n`.
   The installer publishes dist/ to /var/www/mining-tycoon (root-owned),
   installs nginx/rsync if missing, writes the nginx site on first deploy,
   optionally obtains a Let's Encrypt certificate and smoke-tests the pages.

Requirements:
  - Local: Node.js/npm, OpenSSH client (ssh, scp) and tar.exe (Windows 10+).
  - Server: Debian/Ubuntu with systemd; the SSH user needs passwordless sudo.

.PARAMETER ApiBaseUrl
Public backend URL baked into the build, e.g. https://api.example.com.

.PARAMETER FrontendDomain
Host name the game is served under, e.g. game.example.com (nginx server_name).

.PARAMETER LetsEncryptEmail
If given, certbot obtains/installs a certificate for FrontendDomain.
DNS must already point to the server.

.EXAMPLE
.\scripts\deploy-to-vps.ps1 -VpsUser deploy -VpsHost 203.0.113.10 `
    -FrontendDomain game.example.com -ApiBaseUrl https://api.example.com `
    -LetsEncryptEmail ops@example.com

.EXAMPLE
.\scripts\deploy-to-vps.ps1 -VpsUser deploy -VpsHost 203.0.113.10 `
    -FrontendDomain game.example.com -ApiBaseUrl https://api.example.com -DryRun
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$VpsUser,

    [Parameter(Mandatory = $true)]
    [string]$VpsHost,

    [Parameter(Mandatory = $true)]
    [string]$FrontendDomain,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$ApiBaseUrl,

    [string]$LetsEncryptEmail = "",
    [string]$SshKey = "",
    [int]$SshPort = 22,
    [switch]$ResetNginxConfig,
    [switch]$AllowInsecureHttp,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$stagingDir = "mining-frontend-staging"
$archiveName = "mining-frontend-upload.tgz"
$domainPattern = '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
$emailPattern = '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$'

function Invoke-Native {
    param([string]$FilePath, [string[]]$Arguments)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "'$FilePath' failed with exit code $LASTEXITCODE"
    }
}

# ------------------------------------------------------------------ validation
$ApiBaseUrl = $ApiBaseUrl.Trim().TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    throw "-ApiBaseUrl is empty. Pass the public backend URL, e.g. https://api.example.com"
}
$urlPattern = if ($AllowInsecureHttp) { '^https?://[^\s/?#]+(/[^\s?#]*)?$' } else { '^https://[^\s/?#]+(/[^\s?#]*)?$' }
if ($ApiBaseUrl -notmatch $urlPattern) {
    throw "-ApiBaseUrl '$ApiBaseUrl' must be an https:// URL (use -AllowInsecureHttp only for testing)."
}
if ($ApiBaseUrl -match '^https?://(localhost|127\.|\[::1\])') {
    throw "-ApiBaseUrl points to localhost; players' browsers could not reach it."
}
if ($FrontendDomain -notmatch $domainPattern) {
    throw "-FrontendDomain must be a host name such as game.example.com"
}
if ($LetsEncryptEmail -and $LetsEncryptEmail -notmatch $emailPattern) {
    throw "-LetsEncryptEmail is not a valid e-mail address"
}
if ($AllowInsecureHttp) {
    Write-Warning "-AllowInsecureHttp: the build may talk to the backend over plain HTTP. Testing only."
}

# Use the Windows bsdtar explicitly: a GNU tar from Git/MSYS would treat
# "C:\..." archive paths as remote host names.
$tarExe = Join-Path $env:SystemRoot "System32\tar.exe"
if (-not (Test-Path $tarExe)) { $tarExe = "tar" }

Write-Host "==> Mining Tycoon frontend deployment" -ForegroundColor Green
Write-Host "    Target:   ${VpsUser}@${VpsHost}:$SshPort"
Write-Host "    Domain:   $FrontendDomain"
Write-Host "    API base: $ApiBaseUrl"

Push-Location $projectRoot
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) ("mining-frontend-" + [guid]::NewGuid().ToString("N") + ".tgz")
$previousApiBase = $env:VITE_API_BASE_URL
try {
    # -------------------------------------------------------------- build
    if (-not (Test-Path "node_modules")) {
        Write-Host "==> Installing dependencies (npm ci)" -ForegroundColor Cyan
        Invoke-Native "npm" @("ci")
    }
    if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

    Write-Host "==> Building with VITE_API_BASE_URL=$ApiBaseUrl" -ForegroundColor Cyan
    $env:VITE_API_BASE_URL = $ApiBaseUrl
    Invoke-Native "npm" @("run", "build")

    foreach ($page in @("index.html", "player.html", "admin.html", "how-to-play.html", "privacy.html", "imprint.html")) {
        if (-not (Test-Path (Join-Path "dist" $page))) {
            throw "Build output is missing dist/$page"
        }
    }
    $bundleHit = Get-ChildItem -Path "dist/assets" -Filter "*.js" -File |
        Select-String -SimpleMatch -Pattern $ApiBaseUrl -List |
        Select-Object -First 1
    if (-not $bundleHit) {
        throw ("The built bundle does not contain '$ApiBaseUrl'. This frontend version " +
            "probably does not read VITE_API_BASE_URL yet; refusing to deploy a build " +
            "that would call http://127.0.0.1:8000.")
    }
    Write-Host "OK: build contains the API base URL" -ForegroundColor Green

    # -------------------------------------------------------------- package
    Invoke-Native $tarExe @("-czf", $archivePath, "-C", $projectRoot, "dist", "deploy")

    $installerArgs = @("--frontend-domain", $FrontendDomain)
    if ($LetsEncryptEmail) { $installerArgs += @("--letsencrypt-email", $LetsEncryptEmail) }
    if ($ResetNginxConfig) { $installerArgs += "--reset-nginx" }

    # All values in this command were validated above, so plain quoting is safe.
    $remoteCommand = (
        "set -e; " +
        "rm -rf ~/$stagingDir; mkdir -p ~/$stagingDir; " +
        "tar -xzf ~/$archiveName -C ~/$stagingDir; rm -f ~/$archiveName; " +
        "sudo -n bash ~/$stagingDir/deploy/remote/install-frontend.sh " +
        (($installerArgs | ForEach-Object { "'$_'" }) -join " ") + "; " +
        "rm -rf ~/$stagingDir"
    )

    $sshArgs = @("-p", "$SshPort")
    $scpArgs = @("-P", "$SshPort")
    if ($SshKey) {
        $sshArgs += @("-i", $SshKey)
        $scpArgs += @("-i", $SshKey)
    }
    $target = "${VpsUser}@${VpsHost}"

    if ($DryRun) {
        Write-Host ""
        Write-Host "DRY RUN - nothing was uploaded. Package contents:" -ForegroundColor Yellow
        Invoke-Native $tarExe @("-tzf", $archivePath)
        Write-Host ""
        Write-Host "Would run: scp $($scpArgs -join ' ') <package> ${target}:$archiveName"
        Write-Host "Would run: ssh $($sshArgs -join ' ') $target `"$remoteCommand`""
        return
    }

    # -------------------------------------------------------------- upload + install
    Write-Host "==> Uploading package" -ForegroundColor Cyan
    Invoke-Native "scp" ($scpArgs + @($archivePath, "${target}:$archiveName"))

    Write-Host "==> Running server-side installer" -ForegroundColor Cyan
    Invoke-Native "ssh" ($sshArgs + @($target, $remoteCommand))

    $scheme = if ($LetsEncryptEmail) { "https" } else { "http" }
    Write-Host ""
    Write-Host "OK: frontend deployed: ${scheme}://$FrontendDomain/" -ForegroundColor Green
    if (-not $LetsEncryptEmail) {
        Write-Host "    No -LetsEncryptEmail given: make sure TLS is configured (see DEPLOY.md)." -ForegroundColor Yellow
    }
}
finally {
    $env:VITE_API_BASE_URL = $previousApiBase
    if (Test-Path $archivePath) { Remove-Item -Force $archivePath }
    Pop-Location
}
