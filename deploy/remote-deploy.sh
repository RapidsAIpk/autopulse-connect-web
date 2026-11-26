#!/usr/bin/env bash
# Runs ON the server (called by GitHub Actions). Unpacks the standalone build, switches `current`, reloads pm2,
# and rolls back automatically if the page does not answer.
#   usage: remote-deploy.sh <release-tarball> <release-id>
set -euo pipefail

APP=/opt/autopulse-connect-web
TARBALL="$1"
RELEASE="$APP/releases/$2"
export PATH=/opt/node-22/bin:$PATH

mkdir -p "$RELEASE"
tar -xzf "$TARBALL" -C "$RELEASE"
rm -f "$TARBALL"

PREVIOUS=$(readlink -f "$APP/current" 2>/dev/null || true)
ln -sfn "$RELEASE" "$APP/current"
pm2 startOrReload "$RELEASE/deploy/ecosystem.config.cjs" --update-env
pm2 save >/dev/null

for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3020/login || true)
  if [ "$code" = "200" ] || [ "$code" = "307" ]; then
    echo "Web healthy (release $2)"
    ls -1dt "$APP"/releases/* | tail -n +6 | xargs -r rm -rf   # keep the last 5 releases
    # Domain + free SSL (nginx, Let's Encrypt): adds them on a new server, renews when due, leaves a working
    # setup alone. A failure here marks the run red but keeps the new (healthy) release running.
    bash "$RELEASE/deploy/ensure-domain.sh" "$RELEASE"
    exit 0
  fi
  sleep 3
done

echo "Web failed its health check — rolling back" >&2
if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
  ln -sfn "$PREVIOUS" "$APP/current"
  pm2 startOrReload "$PREVIOUS/deploy/ecosystem.config.cjs" --update-env
  pm2 save >/dev/null
fi
exit 1
