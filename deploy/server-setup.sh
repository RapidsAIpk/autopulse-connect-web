#!/usr/bin/env bash
# ONE-TIME setup on Contabo (run as root). Safe to re-run. Touches only:
#   /opt/node-22, /opt/autopulse-connect-api, /opt/autopulse-connect-web, one new nginx site on port 8090,
#   ufw port 8090, and root's ~/.ssh/authorized_keys (the CI deploy key).
# Does NOT change the global Node 18, any other app, or the live Connect Hub (/opt/autopulse-connect).
# The backend .env comes from the API_ENV GitHub secret on every deploy, not from this script.
#   usage: bash server-setup.sh "<ci-public-key>"
set -euo pipefail

NODE_VERSION=v22.21.1
PUBLIC_PORT=8090
CI_PUBKEY="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== 1. Private Node 22 in /opt/node-22 (global Node 18 untouched)"
if [ ! -x /opt/node-22/bin/node ]; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
  mkdir -p /opt/node-22 && tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" -C /opt/node-22 --strip-components=1
  rm -f "node-${NODE_VERSION}-linux-x64.tar.xz"
fi
/opt/node-22/bin/node -v
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 /opt/node-22/bin/corepack yarn@1.22.22 --version

echo "== 2. App folders"
mkdir -p /opt/autopulse-connect-api/releases /opt/autopulse-connect-api/shared/data /opt/autopulse-connect-web/releases

echo "== 3. nginx site on port ${PUBLIC_PORT}"
cp "$HERE/nginx/autopulse-connect-next.conf" /etc/nginx/sites-available/autopulse-connect-next.conf
ln -sfn /etc/nginx/sites-available/autopulse-connect-next.conf /etc/nginx/sites-enabled/autopulse-connect-next.conf
nginx -t
systemctl reload nginx

echo "== 4. Firewall: open ${PUBLIC_PORT}"
ufw allow "${PUBLIC_PORT}/tcp" comment 'autopulse-connect-next' >/dev/null
ufw status | grep "${PUBLIC_PORT}" || true

echo "== 5. CI deploy key"
if [ -n "$CI_PUBKEY" ]; then
  mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
  grep -qF "$CI_PUBKEY" ~/.ssh/authorized_keys || echo "$CI_PUBKEY" >> ~/.ssh/authorized_keys
  echo "   CI key installed"
fi

echo "Done."
