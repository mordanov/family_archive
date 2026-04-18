#!/usr/bin/env bash
# Standalone deploy helper for family-archive (without web-folders shared stack).
# When running inside the shared stack, use ../web-folders/deploy-one-db.sh instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"

# Env precedence for compose interpolation:
# 1) STRICT_ENV_ONLY=1  -> ambient environment only (no file loading)
# 2) COMPOSE_ENV_FILE   -> explicitly provided env file
# 3) $ROOT_DIR/.env     -> default standalone project env file
if [[ "${STRICT_ENV_ONLY:-0}" == "1" ]]; then
  COMPOSE=(docker compose --env-file /dev/null -f "$COMPOSE_FILE")
  echo "[deploy] Using ambient environment only (STRICT_ENV_ONLY=1)."
elif [[ -n "${COMPOSE_ENV_FILE:-}" ]]; then
  COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE")
  echo "[deploy] Using env file: $COMPOSE_ENV_FILE"
elif [[ -f "$ROOT_DIR/.env" ]]; then
  COMPOSE=(docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE")
  echo "[deploy] Using env file: $ROOT_DIR/.env"
else
  COMPOSE=(docker compose -f "$COMPOSE_FILE")
  echo "[deploy] No .env file found; relying on ambient environment variables."
fi

cd "$ROOT_DIR"

echo "[deploy] Validating compose config..."
"${COMPOSE[@]}" config > /dev/null

echo "[deploy] Building images..."
"${COMPOSE[@]}" build archive-backend archive-frontend

echo "[deploy] Starting database..."
"${COMPOSE[@]}" up -d archive-db

echo "[deploy] Waiting for database..."
for i in {1..30}; do
  if "${COMPOSE[@]}" exec -T archive-db pg_isready -U "${ARCHIVE_POSTGRES_USER:-archive_user}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "[deploy] Starting application..."
"${COMPOSE[@]}" up -d --remove-orphans

echo "[deploy] Health check..."
for i in {1..30}; do
  if curl -fsS http://localhost/health >/dev/null 2>&1; then
    echo "[deploy] OK — service is healthy."
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 2
done

echo "[deploy] Health check failed; recent logs:" >&2
"${COMPOSE[@]}" logs --tail=80 archive-backend >&2 || true
exit 1

