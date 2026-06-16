#!/usr/bin/env sh
set -eu

if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  git pull --ff-only
fi

npm install
npm run doctor

docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build

docker image prune -f >/dev/null 2>&1 || true

echo "Aggiornamento completato."
