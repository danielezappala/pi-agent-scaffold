#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "Errore: .env non trovato. Copia .env.example in .env o esegui npm run setup." >&2
  exit 1
fi

PORT="${LIBRECHAT_PORT:-3080}"

# Controlla se Docker è disponibile
if ! docker info > /dev/null 2>&1; then
  echo "Errore: Docker non è in esecuzione o non è installato." >&2
  echo "" >&2
  echo "Installa Docker Desktop da: https://www.docker.com/products/docker-desktop" >&2
  echo "Dopo l'installazione avvia Docker Desktop e riprova." >&2
  exit 1
fi

# Controlla se la porta è già occupata
if lsof -ti :"$PORT" > /dev/null 2>&1; then
  echo "Errore: la porta $PORT è già in uso." >&2
  echo "" >&2
  echo "Soluzioni:" >&2
  echo "  1) Libera la porta:  lsof -ti :$PORT | xargs kill -9" >&2
  echo "  2) Cambia porta:     modifica LIBRECHAT_PORT nel .env" >&2
  exit 1
fi

docker compose up -d

echo "LibreChat avviato: http://localhost:${PORT}"
echo "Avvia pi-agent sull'host con: npm run server"
