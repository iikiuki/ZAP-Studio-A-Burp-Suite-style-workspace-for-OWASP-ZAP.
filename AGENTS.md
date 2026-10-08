# AGENTS.md

Repository-specific knowledge for AI agents working on **ZAP Studio**.

## What this project is

A modern, Burp Suite–style desktop-class web UI for **OWASP ZAP**, backed by the
ZAP daemon REST API. The goal: keep ZAP's superior free scanning engine but replace
its dated Swing UI with a fast, keyboard-friendly, dark-themed workspace that feels
like Burp Suite Professional.

- `backend/` — FastAPI service. Owns the ZAP process lifecycle, wraps the ZAP REST
  API, and exposes a clean REST + WebSocket surface to the frontend.
- `frontend/` — React + TypeScript + Vite + Tailwind SPA that renders the workspace.

The backend is the only thing that talks to ZAP. The frontend never calls ZAP directly.

## Local development

### Backend

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8070
```

If ZAP is installed, the backend auto-starts it as a daemon and bootstraps the proxy.
Set `BURPZAP_AUTOSTART_ZAP=false` to attach to an already-running ZAP instead.

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api and /ws to :8070
```

### Full stack

```bash
docker compose up --build     # serves the built SPA + API on http://localhost:8070
```

## Testing

- Backend: `cd backend && pytest -q`
- The backend test suite mocks ZAP at the HTTP layer so it runs without ZAP installed.
- For end-to-end checks, run the bundled demo target and point ZAP at it:
  `python scripts/demo_target.py` (listens on 127.0.0.1:3000).

## OWASP ZAP integration notes (hard-won)

These are the non-obvious behaviours of the ZAP 2.17 daemon API. Do not "fix" them.

- **Start command**: `zap.sh -daemon -host <h> -port <api> -dir <home>
  -config api.key=<key> -config api.addrs.addr.name=.* -config api.addrs.addr.regex=true`.
  Without the `api.addrs` config, only localhost may call the API.
- **First run is slow and restarts the proxy.** With a fresh `-dir`, ZAP downloads
  add-ons at startup and the local proxy server (8080) is *not* listening afterwards.
  Always call `network/action/addLocalServer` after the API is reachable.
- **The proxy is not enabled by default in daemon mode.** Enable it with
  `GET /JSON/network/action/addLocalServer/?address=localhost&port=8080&api=false&proxy=true`.
  Verify with `network/view/getLocalServers`.
- **Actions must be called over GET with query params.** ZAP 2.17 returns
  `content_type_not_supported` for `application/x-www-form-urlencoded` POST bodies.
- **Component naming gotcha**: the *view* namespace is `alert` (singular) — e.g.
  `alert/view/alerts` — while `alerts/view/*` returns `no_implementor`.
- **`spider/view/status` and `ascan/view/status` return `does_not_exist`**; the
  working status views are `spider/view/scans` and `ascan/view/scans` (array of scans
  with `state`). `ascan/view/scanProgress` works with an explicit `scanId`.
- **`fuzz` and `requester` expose no JSON API** (they are Swing-only add-ons). The
  Repeater and Intruder features are therefore implemented by the backend on top of
  `core/action/sendRequest`, which returns `requestHeader`, `responseHeader`,
  `responseBody`, and `rtt` for each message.
- **Proxy history** comes from `core/view/messages` (paginated, newest first by id)
  and `core/view/message?id=` for a single full message.
- **Intercept** uses `break/view/isBreakAll`, `break/view/httpMessage`,
  `break/action/break?type=http&state=true|false`, and `break/action/continue|step|drop`.
- **`core/view/sites`** returns the site tree; `core/view/urls?baseurl=` lists URLs.
- The API UI is self-documenting: `/UI/<component>/` lists views/actions with their
  parameter names. Use it to confirm any endpoint before coding against it.

## Code conventions

- Backend: async everywhere, `httpx.AsyncClient`, pydantic models for every route.
  Routes live under `/api/*`; the WebSocket is `/ws`.
- Frontend: feature folders under `src/features/`, shared UI under `src/components/`.
  State in zustand stores. No direct `fetch` in components — use `src/api/client.ts`.
- Keep the ZAP coupling inside `backend/app/zap_*.py` and `backend/app/services/`.
