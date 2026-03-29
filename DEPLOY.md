# VPS Deployment Guide

This file is the current frontend deployment guide.
For the current implementation state, always cross-check with `README.md`, `PROJECT_BASELINE.md`, and `DOCS_STATUS.md`.

## Quick Start (3 Steps)

```powershell
# 1. Deploy with the script
.\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/game"

# 2. Or with SSH key
.\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/game" -SshKey "C:\path\to\id_rsa"

# 3. Or preview first (dry-run)
.\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/game" -DryRun
```

If frontend and backend should be deployed to the same VPS, use the full-stack script from the sibling backend repo instead:

```powershell
Set-Location "..\Mining tycoon"
& .\deploy-full-stack.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -FrontendDomain "game.your-vps.com" -ApiDomain "api.your-vps.com"
```

## What Gets Deployed?

Included in production deploy:
- `dist/` - Compiled & optimized app
- `public/` - Assets (favicon, etc.)
- `index.html` - Entry point

Not deployed:
- `src/` - Source code
- `node_modules/` - Dependencies
- `scripts/` - Build scripts
- `*.test.js` - Test files
- `.github/`, `.git/` - VCS stuff
- Documentation (`*.md`)

## What You Need On The VPS

Minimum setup:
1. A web server such as nginx, Apache, or a static file server
2. Your backend URL, for example `http://api.your-game.com`
3. Correct backend CORS configuration if frontend and backend are on different origins

Note: this frontend script deploys only the static production assets. Backend bootstrap work such as `venv`, `systemd`, and health checks is handled by `..\Mining tycoon\scripts\deploy-backend.ps1` or by `..\Mining tycoon\deploy-full-stack.ps1`.

## Example Nginx Config

```nginx
server {
    listen 80;
    server_name your-game-domain.com;
    root /var/www/game;
    index index.html;
    
    # Single-page app fallback
    location / {
        try_files $uri /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|svg|png|jpg|gif)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

## Deploy Without `rsync`

If your VPS does not have `rsync`, use one of these alternatives.

### Option 1: ZIP + upload
```powershell
# Lokal:
npm run build
Compress-Archive -Path dist, public, index.html -DestinationPath deploy.zip

# Then upload deploy.zip to the VPS and extract it
unzip deploy.zip -d /var/www/game
```

### Option 2: Git Push
```bash
# Git repo auf VPS, dann:
git pull origin main
npm run build
# (oder im VPS ein post-receive hook mit npm run build)
```

### Option 3: FTP/SFTP fallback
Using WinSCP or FileZilla:
1. Lokal: `npm run build`
2. Upload `dist/`, `public/`, `index.html` in VPS-Pfad

## Configure The Backend URL

The app must know where the backend is. Configure it in the app settings, for example:
```
http://api.your-vps.com:5000
```

Make sure:
- the backend sends CORS headers for your frontend origin
- the backend is reachable
- firewall rules allow the connection

## Troubleshooting

**"dist/" errors**
```powershell
npm run build  # Run manually and fix the reported build errors
```

**"rsync: command not found"**
Install `rsync` on the VPS: `sudo apt install rsync`

**"404 when reloading a route"**
Check whether your web server is configured with `try_files $uri /index.html`.

**"CORS error in browser"**
The backend must send `Access-Control-Allow-Origin` for the frontend origin.
