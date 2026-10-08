# Architecture

ZAP Studio is deliberately split so that exactly one process — the backend —
knows how to talk to OWASP ZAP. Everything else is presentation.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                             │
│  React SPA (src/features/*, src/components/*)                        │
│    │  REST  /api/*           │  WebSocket /ws                         │
└────┼─────────────────────────┼──────────────────────────────────────┘
     ▼                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FastAPI backend (backend/app)                                       │
│                                                                      │
│  routers/*      thin HTTP surface, pydantic request/response models  │
│  services/      domain logic that is not a ZAP call                  │
│    zap_manager  spawn / stop / health of the ZAP daemon              │
│    messages     raw HTTP parsing + core/action/sendRequest           │
│    intruder     attack-type payload generation                       │
│    intruder_runs  background runs + result fan-out                   │
│    events       poller that pushes status/alerts to the event bus    │
│  zap_client     the single httpx client for the ZAP JSON API         │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  OWASP ZAP 2.17 daemon                                               │
│    API   :8090   (JSON)                                              │
│    Proxy :8080   (addLocalServer)                                    │
└──────────────────────────────────────────────────────────────────────┘
```

## Why the backend owns ZAP

ZAP's JSON API has sharp edges: actions must be GET with query params, some
views return bare maps that are easy to mis-parse, the proxy listener is off in
daemon mode, and the add-on set is not stable across installs. Concentrating all
of that in `zap_client` + `services/` keeps the routers readable and means the
frontend only ever sees a clean, typed contract.

## Request lifecycle (Repeater example)

1. The user edits a raw request and hits **Send**.
2. `POST /api/repeater/send` validates the payload and hands it to
   `services/messages.send_raw`.
3. The service parses the raw message, resolves the target URL, and calls
   `core/action/sendRequest` on the ZAP client.
4. ZAP performs the request through the same stack the proxy uses (so sessions,
   cookies, and scan rules apply) and returns headers, body, and round-trip time.
5. The router parses the response into a typed model and returns it.

## Live state

`services/events.ZapPoller` runs a background task that periodically reads
message/alert/scan counts from ZAP and publishes changes on an in-process
`EventBus`. The `/ws` endpoint subscribes each browser to that bus, which drives
the header badges, the status bar, and the dashboard without polling from the
client.

## Intruder execution

Intruder runs are not ZAP scans. `services/intruder` generates the full set of
concrete requests for the chosen attack type, and `services/intruder_runs`
executes them concurrently (bounded by the thread count) through
`core/action/sendRequest`. Results are streamed to the UI as Server-Sent Events
so a large attack stays responsive, and each result carries enough context
(status, length, timing, payload) for the frontend to flag outliers.

## Frontend structure

```
src/
  api/client.ts        one typed function per backend endpoint
  lib/                 formatting, WebSocket hook
  store/app.ts         zustand store: active tab, status, alerts, toasts
  components/          SplitPane, DataTable, HttpMessageViewer, Panel, …
  features/
    dashboard/  target/  proxy/  scanner/  intruder/
    repeater/   alerts/  tools/  reports/  settings/
```

State that many views share (connection status, alert counts) lives in the
zustand store. Everything else is local component state, fetched through
`api/client.ts`.
