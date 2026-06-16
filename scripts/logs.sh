#!/usr/bin/env sh
set -eu

docker compose -f docker-compose.yml -f docker-compose.deploy.yml logs -f --tail=200 "$@"
