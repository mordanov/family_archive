#!/usr/bin/env bash
# Standalone deploy helper for family-archive (without web-folders shared stack).
# When running inside the shared stack, use ../web-folders/deploy-one-db.sh instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"

# Explicitly disable docker compose's automatic .env loading: configuration
# must come from the ambient environment only.
COMPOSE=(docker compose --env-file /dev/null -f "$COMPOSE_FILE")

cd "$ROOT_DIR"

# Fail fast: check that all required ARCHIVE_* variables are set before
# handing off to docker compose, so the error message is actionable.
REQUIRED_VARS=(
  ARCHIVE_POSTGRES_PASSWORD
  ARCHIVE_SECRET_KEY
  ARCHIVE_USER1_PASSWORD
  ARCHIVE_USER2_PASSWORD
  ARCHIVE_S3_ENDPOINT_URL
  ARCHIVE_S3_BUCKET
  ARCHIVE_S3_ACCESS_KEY
  ARCHIVE_S3_SECRET_KEY
)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    MISSING+=("$var")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "[deploy] ERROR: Required environment variables are not set:" >&2
  printf '[deploy]   %s\n' "${MISSING[@]}" >&2
  exit 1
fi

echo "[deploy] Validating compose config..."
"${COMPOSE[@]}" config > /dev/null

echo "[deploy] Building images..."
"${COMPOSE[@]}" build archive-backend archive-frontend

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

