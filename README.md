<div align="center">

# ZAP Studio

**A Burp Suite–style workspace for OWASP ZAP.**

Keep ZAP's excellent free scanning engine. Throw away its dated Swing UI.

[![CI](https://github.com/iikiuki/zap-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/iikiuki/zap-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb)

</div>

---

## Why
(((not shure if it works never tested it its fully vibe coded)))
OWASP ZAP is free, scriptable, and its scanner is genuinely competitive with
commercial tools. What holds it back is the interface: a Swing desktop app that
feels like 2008. Burp Suite has the better workflow but locks it behind a paid
Professional tier.

ZAP Studio is the middle path. It drives a real ZAP 2.17 daemon over its REST API
and presents the results in a fast, dark, keyboard-friendly web workspace modelled
on Burp: proxy history with intercept, a target/site map, spider and active
scanner, Repeater, Intruder, a Decoder and Comparer, and one-click reporting.

```
┌────────────────────────────────────────────────────────────────────────┐
│  ZAP Studio            Dashboard  Target  Proxy  Spider  Scanner …      │
├────────────────────────────────────────────────────────────────────────┤
│  Method  URL                                    Status  Len   MIME     │
│  GET     http://target.local/                    200    139   text/html│
│  GET     http://target.local/api/data            200     96   app/json │
│  POST    http://target.local/login               302     0    —        │
├────────────────────────────────────────────────────────────────────────┤
│  Request                          │  Response                           │
│  POST /login HTTP/1.1             │  HTTP/1.1 302 Found                 │
│  Host: target.local               │  Location: /dashboard               │
└────────────────────────────────────────────────────────────────────────┘
   ZAP 2.17.0 · proxy localhost:8080 · 17 messages · 29 issues
```

## Features

- **Proxy history** — live traffic from ZAP, request/response viewer, filtering,
  and a full intercept mode (break / continue / step / drop).
- **Target & site map** — the site tree plus per-URL drill-down.
- **Spider** — crawl a target and watch scan progress.
- **Active & passive scanner** — start, pause, resume and stop scans; inspect the
  active and passive rule sets.
- **Repeater** — multi-tab request editor backed by `core/action/sendRequest`.
- **Intruder** — Burp-compatible attack types (sniper, battering ram, pitchfork,
  cluster bomb) with streaming results over SSE and automatic highlighting of
  responses that differ in status or length.
- **Alerts / Issues** — normalised findings with risk, confidence, CWE/WASC,
  evidence, description and remediation.
- **Decoder & Comparer** — encoder chains (base64, url, html, hex, gzip, hashes)
  and word/line/char diffs.
- **Reports** — generate any ZAP report template and download it from the UI.
- **ZAP lifecycle** — start/stop the daemon, ensure the proxy, new/save session,
  all from the settings drawer.

## Architecture

```
Browser (React SPA)  ──HTTP/WS──▶  FastAPI backend  ──REST──▶  OWASP ZAP daemon
                                     │                          │
                                     └─ process lifecycle        └─ proxy :8080
                                        event poller                API   :8090
```

The frontend never talks to ZAP directly. The backend owns the daemon, translates
ZAP's JSON API into a clean, typed surface under `/api/*`, and pushes live state
to the UI over `/ws`.

| Layer | Stack |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind, zustand |
| Backend | FastAPI, httpx, pydantic v2, uvicorn |
| Engine | OWASP ZAP 2.17.0 (external daemon) |

## Quick start

### Docker (everything, including ZAP)

```bash
docker compose up --build
# UI + API   → http://localhost:8070
# ZAP proxy  → localhost:8080
```

### From source

Requirements: Python 3.11+, Node 20+, and OWASP ZAP installed
(`BURPZAP_ZAP_PATH=/path/to/zap.sh` if it is not on `PATH`).

```bash
./scripts/run.sh            # builds the SPA, creates the venv, starts everything
```

Or run the two halves by hand:

```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8070

# frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api and /ws
```

Point your browser or CLI at the ZAP proxy and start browsing:

```bash
curl -x http://localhost:8080 http://your-target/
```

### Try it against a safe target

A deliberately vulnerable demo server ships with the repo:

```bash
python scripts/demo_target.py          # http://127.0.0.1:3000
```

Proxy a few requests through ZAP, then open **Spider → Active scan** on that URL.

## Configuration

All backend settings use the `BURPZAP_` prefix (env vars or `backend/.env`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `BURPZAP_HOST` / `BURPZAP_PORT` | `0.0.0.0` / `8070` | Web UI bind address |
| `BURPZAP_ZAP_HOST` / `BURPZAP_ZAP_PORT` | `127.0.0.1` / `8090` | ZAP daemon API |
| `BURPZAP_ZAP_KEY` | generated | ZAP API key (persisted to `$BURPZAP_HOME/api.key`) |
| `BURPZAP_ZAP_PATH` | autodetect | Explicit path to `zap.sh` |
| `BURPZAP_AUTOSTART_ZAP` | `true` | Spawn ZAP, or attach to a running daemon |
| `BURPZAP_PROXY_PORT` | `8080` | ZAP proxy listener to ensure |
| `BURPZAP_HOME` | `~/.zap-studio` | Sessions, reports, API key |

## Development

```bash
# tests (no ZAP required — the API suite runs against a mock transport)
cd backend && python -m pytest -q

# frontend typecheck + production build
cd frontend && npm run lint && npm run build
```

## API surface

| Group | Endpoints |
| --- | --- |
| System | `/api/system/status`, `/zap/start`, `/zap/stop`, `/zap/proxy`, `/session/new`, `/session/save` |
| Target | `/api/target/sites`, `/urls`, `/tree` |
| Proxy | `/api/proxy/history`, `/history/count`, `/message/{id}`, `/intercept`, `/intercept/toggle`, `/intercept/step`, `/intercept/drop` |
| Scans | `/api/scans/spider`, `/ascan`, `/ascan/{id}/pause`, `/resume`, `/stop`, `/scans/*/rules` |
| Alerts | `/api/alerts`, `/count`, `/counts`, `/summary`, `/clear` |
| Repeater | `/api/repeater/send` |
| Intruder | `/api/intruder/preview`, `/runs`, `/runs/{id}`, `/runs/{id}/stream` (SSE), `/runs/{id}/cancel` |
| Reports | `/api/reports/templates`, `/generate`, `/download` |
| Tools | `/api/tools/encoders`, `/transform`, `/diff` |
| Live | `/ws` — status, alerts, proxy and scan events |

## Legal

ZAP Studio is an interface for OWASP ZAP. Only scan systems you are authorised to
test. The bundled demo target is intentionally insecure — run it on loopback only.

## License

MIT — see [LICENSE](LICENSE). OWASP ZAP is licensed separately under Apache 2.0.
