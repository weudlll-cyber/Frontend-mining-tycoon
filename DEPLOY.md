# VPS Deployment Guide

## Quick Start (3 Schritte)

```powershell
# 1. Deploy mit dem Script
.\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/game"

# 2. Or with SSH key
.\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/game" -SshKey "C:\path\to\id_rsa"

# 3. Or preview first (dry-run)
.\scripts\deploy-to-vps.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -VpsPath "/var/www/game" -DryRun
```

Wenn Frontend und Backend gemeinsam auf dieselbe VPS sollen, verwende stattdessen das Full-Stack-Script aus dem sibling backend repo:

```powershell
Set-Location "..\Mining tycoon"
& .\deploy-full-stack.ps1 -VpsUser "deploy" -VpsHost "your-vps.com" -FrontendDomain "game.your-vps.com" -ApiDomain "api.your-vps.com"
```

## Was wird deployed?

✅ **Mitgesendet (Production):**
- `dist/` - Compiled & optimized app
- `public/` - Assets (favicon, etc.)
- `index.html` - Entry point

❌ **NICHT mitgesendet (Dev only):**
- `src/` - Source code
- `node_modules/` - Dependencies
- `scripts/` - Build scripts
- `*.test.js` - Test files
- `.github/`, `.git/` - VCS stuff
- Dokumentation (*.md)

## Was brauchst du auf dem VPS?

**Minimal Setup:**
1. **Ein Web-Server** (nginx, Apache, oder Node.js http-server)
2. **Deine Backend-URL** (in den App-Settings z.B. http://api.your-game.com)
3. **CORS konfiguriert** (falls Backend auf anderem Server)

Hinweis: Dieses Frontend-Script deployed nur die statischen Produktionsdateien. Das Backend-Bootstraping mit `venv`, `systemd` und Healthcheck passiert im Backend-Script `..\Mining tycoon\scripts\deploy-backend.ps1` oder gesammelt über `..\Mining tycoon\deploy-full-stack.ps1`.

## Nginx Config (Beispiel)

```nginx
server {
    listen 80;
    server_name your-game-domain.com;
    root /var/www/game;
    index index.html;
    
    # Single Page App - alle Anfragen auf index.html
    location / {
        try_files $uri /index.html;
    }
    
    # Static Assets - cachen
    location ~* \.(js|css|svg|png|jpg|gif)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

## Ohne rsync deployen?

Falls dein VPS kein rsync hat, nutze diese Alternativen:

### Option 1: ZIP + Upload
```powershell
# Lokal:
npm run build
Compress-Archive -Path dist, public, index.html -DestinationPath deploy.zip

# Dann deploy.zip auf VPS hochladen und entpacken
unzip deploy.zip -d /var/www/game
```

### Option 2: Git Push
```bash
# Git repo auf VPS, dann:
git pull origin main
npm run build
# (oder im VPS ein post-receive hook mit npm run build)
```

### Option 3: FTP/SFTP (Fallback)
Mit WinSCP oder FileZilla:
1. Lokal: `npm run build`
2. Upload `dist/`, `public/`, `index.html` in VPS-Pfad

## Backend konfigurieren

Der App braucht zu wissen, wo der Backend ist. Das stellst du im Spiel in den Settings ein, z.B.:
```
http://api.your-vps.com:5000
```

Stell sicher:
- Backend hat CORS headers für deine Frontend-Domain
- Backend läuft und ist erreichbar
- Firewall erlaubt die Verbindung

## Troubleshooting

**"dist/ Fehler"**
```powershell
npm run build  # Manuell ausführen, Fehler beheben
```

**"rsync: command not found"**
→ rsync auf VPS installieren: `sudo apt install rsync`

**"404 beim Neuladen einer Route"**
→ Web-server konfiguriert richtig (try_files $uri /index.html)?

**"CORS Fehler im Browser"**
→ Backend muss `Access-Control-Allow-Origin` header setzen
