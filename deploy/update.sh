#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
export PATH="$HOME/.local/share/consept-node/bin:$PATH"

if [[ -n "$(git status --porcelain)" ]]; then
  echo 'The checkout has local changes. Preserve them before updating.' >&2
  exit 1
fi

git pull --ff-only
npm ci --no-audit --no-fund
npm run test:server
npm run test:client
npm run build
mkdir -p "$HOME/.config/systemd/user"
cp deploy/user/consept.service "$HOME/.config/systemd/user/consept.service"
systemctl --user daemon-reload
systemctl --user enable --now consept.service
systemctl --user restart consept.service

set -a
source "$HOME/.config/consept/server.env"
set +a
for attempt in {1..20}; do
  if curl --fail --silent "http://${CONSEPT_HOST}:${CONSEPT_PORT}/api/health"; then
    echo
    git log -1 --oneline
    exit 0
  fi
  sleep 1
done
systemctl --user status consept.service --no-pager
exit 1
