#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/ip-site}"
APP_DIR="${APP_DIR:-${REPO_DIR}/voice-coach-ws}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-voice-coach-ws}"
LOG_DIR="${VOICE_COACH_WS_LOG_DIR:-/var/log/voice-coach-ws}"
ENV_FILE="${VOICE_COACH_WS_ENV_FILE:-${APP_DIR}/.env.production}"
WS_PORT="${WS_PORT:-8080}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd npm
require_cmd node
require_cmd pm2

mkdir -p "$LOG_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Repository not found: $REPO_DIR" >&2
  exit 1
fi

echo "[deploy] syncing branch $BRANCH"
git -C "$REPO_DIR" fetch --all --prune
git -C "$REPO_DIR" checkout "$BRANCH"
git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"

if [ ! -f "$ENV_FILE" ] && [ ! -f "$APP_DIR/.env" ]; then
  echo "Missing env file. Expected $ENV_FILE or $APP_DIR/.env" >&2
  exit 1
fi

cd "$APP_DIR"

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" ".env"
fi

echo "[deploy] installing dependencies"
npm ci

echo "[deploy] building websocket service"
npm run build

echo "[deploy] reloading pm2 app $PM2_APP_NAME"
pm2 startOrReload ecosystem.config.cjs --only "$PM2_APP_NAME" --update-env
pm2 save

if command -v curl >/dev/null 2>&1; then
  echo "[deploy] health check on :$WS_PORT"
  curl --fail --silent "http://127.0.0.1:${WS_PORT}/healthz" >/dev/null
else
  echo "[deploy] curl not found, skipping health check"
fi

echo "[deploy] completed at $(date -Is)"
