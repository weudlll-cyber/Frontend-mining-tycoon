#!/usr/bin/env bash
# Server-side installer for the Mining Tycoon frontend (Debian/Ubuntu, nginx).
#
# scripts/deploy-to-vps.ps1 uploads the built dist/ and deploy/ into a staging
# directory in the login user's home and runs this script from there:
#
#   sudo bash deploy/remote/install-frontend.sh --frontend-domain game.example.com \
#       [--letsencrypt-email ops@example.com] [--reset-nginx]
#
# Idempotent: re-running replaces the site files and leaves an existing nginx
# site (possibly edited by certbot) alone unless --reset-nginx is given.
set -euo pipefail

readonly WEB_ROOT=/var/www/mining-tycoon
readonly NGINX_SITE=mining-frontend.conf

SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
readonly SRC_DIR

FRONTEND_DOMAIN=""
LE_EMAIL=""
RESET_NGINX=0

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }

need_value() { [ "$2" -ge 2 ] || die "$1 needs a value"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --frontend-domain) need_value "$1" $#; FRONTEND_DOMAIN=$2; shift 2 ;;
        --letsencrypt-email) need_value "$1" $#; LE_EMAIL=$2; shift 2 ;;
        --reset-nginx) RESET_NGINX=1; shift ;;
        *) die "unknown argument: $1" ;;
    esac
done

readonly DOMAIN_RE='^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'

[ "$(id -u)" -eq 0 ] || die "run this script as root (sudo)"
[[ $FRONTEND_DOMAIN =~ $DOMAIN_RE ]] || die "--frontend-domain must be a host name such as game.example.com"
if [ -n "$LE_EMAIL" ]; then
    [[ $LE_EMAIL =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || die "--letsencrypt-email is not an e-mail address"
fi
for page in index.html player.html admin.html how-to-play.html privacy.html imprint.html; do
    [ -f "$SRC_DIR/dist/$page" ] || die "$SRC_DIR/dist/$page is missing; upload the built dist/ first"
done

# ---------------------------------------------------------------- packages
packages=(nginx rsync curl ca-certificates)
[ -n "$LE_EMAIL" ] && packages+=(certbot python3-certbot-nginx)
missing=()
for pkg in "${packages[@]}"; do
    dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed' || missing+=("$pkg")
done
if [ ${#missing[@]} -gt 0 ]; then
    command -v apt-get >/dev/null || die "apt-get not found; install manually: ${missing[*]}"
    log "Installing packages: ${missing[*]}"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q
    apt-get install -y -q --no-install-recommends "${missing[@]}"
fi

# ---------------------------------------------------------------- site files
# Files are owned by root and only readable by nginx. --delay-updates and
# --delete-after keep the switch from old to new files as short as possible.
log "Publishing dist/ to $WEB_ROOT"
install -d -o root -g root -m 0755 "$WEB_ROOT"
rsync -a --delete --delete-after --delay-updates \
    --chown=root:root --chmod=D755,F644 \
    --exclude='.*' --exclude='*.md' \
    "$SRC_DIR/dist/" "$WEB_ROOT/"

# ---------------------------------------------------------------- nginx
site_available=/etc/nginx/sites-available/$NGINX_SITE
site_enabled=/etc/nginx/sites-enabled/$NGINX_SITE
nginx_written=0
if [ ! -f "$site_available" ] || [ "$RESET_NGINX" -eq 1 ]; then
    log "Writing nginx site $site_available"
    [ -f "$site_available" ] && cp -p "$site_available" "$site_available.bak"
    sed -e "s/__FRONTEND_DOMAIN__/$FRONTEND_DOMAIN/g" -e "s#__WEB_ROOT__#$WEB_ROOT#g" \
        "$SRC_DIR/deploy/nginx/mining-frontend.conf" >"$site_available"
    nginx_written=1
else
    log "Keeping existing $site_available (use --reset-nginx to rewrite it from the template)"
fi
ln -sfn "$site_available" "$site_enabled"
if ! nginx -t; then
    if [ "$nginx_written" -eq 1 ] && [ -f "$site_available.bak" ]; then
        mv -f "$site_available.bak" "$site_available"
        warn "restored the previous $site_available"
    fi
    die "nginx configuration test failed"
fi
systemctl enable --quiet --now nginx
systemctl reload nginx

if [ -n "$LE_EMAIL" ]; then
    if [ "$nginx_written" -eq 1 ] || [ ! -d "/etc/letsencrypt/live/$FRONTEND_DOMAIN" ]; then
        log "Requesting/installing Let's Encrypt certificate for $FRONTEND_DOMAIN"
        certbot --nginx --non-interactive --agree-tos -m "$LE_EMAIL" \
            --redirect --hsts --keep-until-expiring -d "$FRONTEND_DOMAIN"
    fi
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
    ufw allow 'Nginx Full' >/dev/null
fi

# ---------------------------------------------------------------- smoke test
# --resolve sends the request to this host's nginx with the real host name,
# following the HTTP -> HTTPS redirect once TLS is set up. A few attempts are
# made because `systemctl reload nginx` returns before the new config is live.
fetch_via_nginx() {
    local attempt
    for attempt in 1 2 3 4 5; do
        if curl -fs -L -o /dev/null \
            --resolve "$FRONTEND_DOMAIN:80:127.0.0.1" --resolve "$FRONTEND_DOMAIN:443:127.0.0.1" \
            "http://$FRONTEND_DOMAIN/$1"; then
            return 0
        fi
        [ "$attempt" -lt 5 ] && sleep 2
    done
    return 1
}

log "Checking the pages through nginx"
for page in index.html player.html admin.html how-to-play.html privacy.html imprint.html; do
    fetch_via_nginx "$page" || die "GET /$page through nginx failed (check $site_available and DNS/TLS)"
    echo "    /$page OK"
done

log "Frontend deployed to $WEB_ROOT."
