#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "Errore: .env non trovato. Copia .env.example in .env o esegui npm run setup." >&2
  exit 1
fi

docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build

echo ""
echo "Stack avviato."
echo "LibreChat: http://localhost:3080"
echo "Pi Agent API: http://localhost:3001/v1"
