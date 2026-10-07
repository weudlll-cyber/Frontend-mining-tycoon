# Frontend VPS Deployment Guide

This is the deployment runbook for the Mining Tycoon frontend. For the current
implementation state, cross-check `README.md`, `PROJECT_BASELINE.md` and
`DOCS_STATUS.md`. The backend (and the combined full-stack deploy) is
documented in the sibling backend repo's `BACKEND_DEPLOY.md`.

## What Gets Deployed

Only the Vite build output `dist/` is published:

- `index.html` (start/lobby), `player.html` (game), `admin.html` (round setup)
- `assets/` - hashed JS/CSS bundles plus the images from `public/assets/`
- `vite.svg`

Source files (`src/`, the source HTML that references `/src/*.js`),
`package*.json`, `node_modules/`, `data/`, `docs/`, tests, tooling and dot
files are never uploaded. The server serves `dist/` from
`/var/www/mining-tycoon` (root-owned, read-only for nginx).

## Backend URL (`VITE_API_BASE_URL`)

The backend URL is fixed at build time through the Vite environment variable
`VITE_API_BASE_URL`, e.g. `https://api.example.com`. Without it the build
falls back to `http://127.0.0.1:8000`, which only works for local
development. The deploy script:

- requires `-ApiBaseUrl` and refuses empty, `localhost` or non-`https` values
  (`-AllowInsecureHttp` permits `http://` for testing only),
- sets `VITE_API_BASE_URL` for `npm run build` only,
- refuses to deploy if the URL does not appear in the built bundle (for
  example when building a frontend version without `VITE_API_BASE_URL` support).

The backend must allow the game origin: its `CORS_ALLOWED_ORIGINS` and
`ALLOWED_WS_ORIGINS` must be `https://game.example.com` (set automatically by
the backend deploy script).

## Prerequisites

- Debian 12 / Ubuntu 22.04+ server with systemd; an SSH user with
  **passwordless sudo** (the installer runs via `sudo -n`).
- DNS for the game domain pointing to the server (needed for TLS).
- Locally (Windows): Node.js/npm, PowerShell 7 (5.1 also works), the OpenSSH
  client (`ssh`, `scp`) and `tar.exe` (both ship with Windows 10/11).
  `rsync` is not needed locally; the installer installs `rsync` and `nginx`
  on the server if missing.

## Deploy Procedure

1. Deploy the backend first (see `BACKEND_DEPLOY.md`), or use the full-stack
   script from the backend repo, which runs both deploys in order:

   ```powershell
   Set-Location "..\Mining tycoon"
   .\deploy-full-stack.ps1 -VpsUser deploy -VpsHost 203.0.113.10 `
       -FrontendDomain game.example.com -ApiDomain api.example.com `
       -LetsEncryptEmail ops@example.com
   ```

2. Frontend only:

   ```powershell
   .\scripts\deploy-to-vps.ps1 -VpsUser deploy -VpsHost 203.0.113.10 `
       -FrontendDomain game.example.com -ApiBaseUrl https://api.example.com `
       -LetsEncryptEmail ops@example.com
   ```

   Add `-DryRun` to build and list the package without contacting the server.

3. What the script does:
   1. `npm ci` (only if `node_modules/` is missing), then
      `npm run build` with `VITE_API_BASE_URL` set; any build error stops the deploy.
   2. Checks that `dist/index.html`, `dist/player.html`, `dist/admin.html` exist
      and that the bundle contains the API URL.
   3. Packs `dist/` and `deploy/` with `tar.exe`, uploads them with `scp` to
      `~/mining-frontend-upload.tgz` and runs
      `deploy/remote/install-frontend.sh` with `sudo -n` on the server.
   4. The installer publishes `dist/` to `/var/www/mining-tycoon` with
      `rsync --delete --delay-updates`, writes the nginx site on the first
      deploy, runs certbot when `-LetsEncryptEmail` is given, and fetches the
      four pages (`index.html`, `player.html`, `admin.html`,
      `how-to-play.html`) through nginx.

4. Open `https://game.example.com/`.

### Script Parameters

| Parameter | Meaning |
| --- | --- |
| `-VpsUser`, `-VpsHost` | SSH login (user needs passwordless sudo) |
| `-FrontendDomain` | game host name, e.g. `game.example.com` (nginx `server_name`) |
| `-ApiBaseUrl` | public backend URL baked into the build, e.g. `https://api.example.com` |
| `-LetsEncryptEmail` | request/install a TLS certificate with certbot (`--redirect --hsts`) |
| `-SshKey`, `-SshPort` | optional SSH key file and port (default 22) |
| `-ResetNginxConfig` | rewrite the nginx site from the template (re-runs certbot when `-LetsEncryptEmail` is set) |
| `-AllowInsecureHttp` | allow an `http://` API URL - testing only |
| `-DryRun` | build and pack only; nothing is uploaded |

## nginx

Template: `deploy/nginx/mining-frontend.conf` (placeholders
`__FRONTEND_DOMAIN__`, `__WEB_ROOT__`), installed as
`/etc/nginx/sites-available/mining-frontend.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name game.example.com;

    root /var/www/mining-tycoon;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. { deny all; }

    # Hashed Vite bundles: cache forever.
    location ~ "^/assets/[^/]+-[A-Za-z0-9_-]{8}\.(js|css)$" {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        # (security headers repeated here, see the template)
        try_files $uri =404;
    }

    # Unhashed images from public/assets: one week.
    location /assets/ {
        expires 7d;
        try_files $uri =404;
    }

    # HTML pages: always revalidate so a deploy is visible immediately.
    location / {
        expires -1;
        try_files $uri $uri.html $uri/ =404;
    }
}
```

This is a multi-page app, not an SPA: `/`, `/index.html`, `/player.html` and
`/admin.html` (also `/player`, `/admin`) are served; unknown paths return 404.

The installer writes the site only if it does not exist yet (or with
`-ResetNginxConfig`), because certbot edits it in place when adding TLS.

## TLS

With `-LetsEncryptEmail` the installer runs:

```bash
sudo certbot --nginx --non-interactive --agree-tos -m ops@example.com \
    --redirect --hsts --keep-until-expiring -d game.example.com
```

Without it, run that command yourself once DNS points to the server.
Renewal runs automatically via the packaged `certbot.timer`
(`sudo certbot renew --dry-run` to test). Only ports 80 and 443 (plus SSH)
need to be open (`sudo ufw allow 'Nginx Full'`).

## Manual Deploy (Without the Script)

```powershell
$env:VITE_API_BASE_URL = "https://api.example.com"
npm ci
npm run build
Remove-Item Env:VITE_API_BASE_URL
ssh deploy@203.0.113.10 "rm -rf ~/mining-frontend-staging && mkdir ~/mining-frontend-staging"
scp -r dist deploy deploy@203.0.113.10:mining-frontend-staging/
ssh deploy@203.0.113.10 "sudo bash ~/mining-frontend-staging/deploy/remote/install-frontend.sh --frontend-domain game.example.com && rm -rf ~/mining-frontend-staging"
```

## Troubleshooting

**Build fails** - run `npm run build` locally and fix the reported errors; the
deploy script stops on any non-zero exit code.

**"The built bundle does not contain ..."** - the checked-out frontend does
not read `VITE_API_BASE_URL`; update the frontend before deploying.

**`sudo: a password is required`** - configure passwordless sudo for the
deploy user (`visudo -f /etc/sudoers.d/deploy`).

**404 for a page** - check that `dist/` contained it and that
`/var/www/mining-tycoon/<page>.html` exists; there is no SPA fallback by design.

**CORS or chat errors in the browser** - the backend's `CORS_ALLOWED_ORIGINS`
and `ALLOWED_WS_ORIGINS` must exactly match `https://game.example.com`
(scheme + host, no trailing slash). Re-run the backend deploy with the
correct `-FrontendOrigin`.

**Mixed content errors** - the page is served over https but the build points
to an `http://` API. Rebuild with an `https://` `-ApiBaseUrl`.
