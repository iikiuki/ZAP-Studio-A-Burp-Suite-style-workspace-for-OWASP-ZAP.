#!/usr/bin/env bash
# Start ZAP Studio: build the SPA if needed, then run the backend which serves it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d frontend/dist ]; then
  echo "==> Building frontend"
  (cd frontend && npm install && npm run build)
fi

if [ ! -d backend/.venv ]; then
  echo "==> Creating backend virtualenv"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

echo "==> Starting ZAP Studio on http://localhost:${BURPZAP_PORT:-8070}"
exec backend/.venv/bin/uvicorn app.main:app \
  --app-dir backend \
  --host "${BURPZAP_HOST:-0.0.0.0}" \
  --port "${BURPZAP_PORT:-8070}"
