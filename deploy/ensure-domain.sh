#!/usr/bin/env bash
# Runs ON the server after each web deploy (called by remote-deploy.sh). Makes sure the domain is served by
# nginx with a free Let's Encrypt certificate, without disturbing a setup that already works:
#   1. nginx + certbot missing           → install them (Ubuntu/Debian apt, or Amazon Linux dnf/yum)
#   2. no nginx site serves $DOMAIN yet  → write deploy/nginx/site.conf.template for it, test, reload
#      (a site that already serves it, hand-made or ours, is left exactly as it is)
#   3. no certificate for $DOMAIN yet    → certbot --nginx: issues it, adds 443 + http→https redirect
#      certificate already there         → `certbot renew` for it, which only renews when < 30 days are left
#   4. certbot's own renewal timer is switched on, so renewal also happens between deploys
#
#   usage: ensure-domain.sh <release-dir>
#   env:   DOMAIN (empty = skip everything), CERTBOT_EMAIL (optional), API_PORT (4009), WEB_PORT (3020),
#          SITE_NAME (autopulse-connect-app)
# The domain's DNS must already point at this server (sslip.io names always do), or step 3 fails.
set -euo pipefail

RELEASE="$1"
DOMAIN="${DOMAIN:-}"
API_PORT="${API_PORT:-4009}"
WEB_PORT="${WEB_PORT:-3020}"
SITE_NAME="${SITE_NAME:-autopulse-connect-app}"

if [ -z "$DOMAIN" ]; then
  echo "Domain: DEPLOY_DOMAIN is not set, skipping nginx/SSL"
  exit 0
fi
if ! printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'; then
  echo "Domain: '$DOMAIN' is not a valid host name" >&2
  exit 1
fi

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo -n"

# ---- 1. nginx + certbot ----
if ! command -v nginx >/dev/null || ! command -v certbot >/dev/null; then
  echo "Domain: installing nginx and certbot"
  if command -v apt-get >/dev/null; then
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx
  elif command -v dnf >/dev/null; then
    $SUDO dnf install -y -q nginx certbot python3-certbot-nginx
  else
    $SUDO yum install -y -q nginx certbot python3-certbot-nginx
  fi
  $SUDO systemctl enable --now nginx
fi

# Debian/Ubuntu use sites-available/-enabled; Amazon Linux/RHEL only conf.d.
if [ -d /etc/nginx/sites-enabled ]; then
  AVAILABLE="/etc/nginx/sites-available/$SITE_NAME.conf"
  ENABLED="/etc/nginx/sites-enabled/$SITE_NAME.conf"
else
  AVAILABLE="/etc/nginx/conf.d/$SITE_NAME.conf"
  ENABLED=""
fi

# ---- 2. nginx site ----
served_by_nginx() {
  # -R (not -r): sites-enabled entries are symlinks, which -r skips.
  $SUDO grep -RhsE '^[[:space:]]*server_name[[:space:]]' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
    | sed -E 's/^[[:space:]]*server_name//; s/;.*$//' | tr -s ' \t' '\n\n' | grep -qxF "$DOMAIN"
}

if served_by_nginx; then
  echo "Domain: nginx already serves $DOMAIN, site left unchanged"
else
  echo "Domain: adding nginx site for $DOMAIN ($AVAILABLE)"
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__API_PORT__/$API_PORT/g" -e "s/__WEB_PORT__/$WEB_PORT/g" \
    "$RELEASE/deploy/nginx/site.conf.template" | $SUDO tee "$AVAILABLE" >/dev/null
  [ -z "$ENABLED" ] || $SUDO ln -sfn "$AVAILABLE" "$ENABLED"
  if ! $SUDO nginx -t; then
    echo "Domain: nginx config test failed, removing the new site" >&2
    [ -z "$ENABLED" ] || $SUDO rm -f "$ENABLED"
    $SUDO rm -f "$AVAILABLE"
    exit 1
  fi
  $SUDO systemctl reload nginx
fi

# Firewall: let Let's Encrypt and browsers in (only if ufw is active; AWS uses its security group instead).
if command -v ufw >/dev/null && $SUDO ufw status 2>/dev/null | grep -q '^Status: active'; then
  $SUDO ufw allow 80/tcp >/dev/null
  $SUDO ufw allow 443/tcp >/dev/null
fi

# ---- 3. certificate ----
# Any existing certificate that covers the domain counts (its name may be "<domain>-0001" or a shared one).
CERT_NAME=$($SUDO certbot certificates -d "$DOMAIN" 2>/dev/null | sed -nE 's/^[[:space:]]*Certificate Name:[[:space:]]*//p' | head -1)
if [ -n "$CERT_NAME" ]; then
  echo "Domain: certificate '$CERT_NAME' covers $DOMAIN, renewing only if it is due"
  # Never fails the deploy: the site keeps its current (still valid) certificate if Let's Encrypt is unreachable.
  $SUDO certbot renew --cert-name "$CERT_NAME" --quiet --deploy-hook "systemctl reload nginx" \
    || echo "Domain: renewal check failed, will retry on the next deploy / certbot timer" >&2
else
  echo "Domain: requesting a Let's Encrypt certificate for $DOMAIN"
  if [ -n "${CERTBOT_EMAIL:-}" ]; then ACCOUNT=(-m "$CERTBOT_EMAIL"); else ACCOUNT=(--register-unsafely-without-email); fi
  $SUDO certbot --nginx -d "$DOMAIN" --cert-name "$DOMAIN" --non-interactive --agree-tos "${ACCOUNT[@]}" --redirect
  CERT_NAME="$DOMAIN"
fi

# ---- 4. automatic renewal between deploys ----
if command -v systemctl >/dev/null && systemctl list-unit-files 2>/dev/null | grep -q '^certbot.timer'; then
  $SUDO systemctl enable --now certbot.timer >/dev/null 2>&1 || true
fi

$SUDO certbot certificates --cert-name "$CERT_NAME" 2>/dev/null | grep -E 'Expiry Date' | sed 's/^ */Domain: /' || true
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login" || true)
echo "Domain: https://$DOMAIN/login answers $code"
