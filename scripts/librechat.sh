#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "Errore: .env non trovato. Copia .env.example in .env o esegui npm run setup." >&2
  exit 1
fi

docker compose up -d

echo "LibreChat avviato: http://localhost:${LIBRECHAT_PORT:-3080}"
echo "Avvia pi-agent sull'host con: npm run server"
