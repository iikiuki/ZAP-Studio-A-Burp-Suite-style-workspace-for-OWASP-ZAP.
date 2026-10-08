# Contributing to ZAP Studio

Thanks for helping improve ZAP Studio. This project is a UI layer over OWASP ZAP,
so the most useful contributions are usually in one of two places: the backend's
translation of ZAP's API, or the frontend's presentation of it.

## Getting set up

Follow the "From source" section of the [README](README.md). In short:

```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cd frontend && npm install
```

You do **not** need ZAP installed to run the tests — the backend suite mocks the
daemon at the HTTP transport layer.

## Before you open a pull request

```bash
cd backend && python -m pytest -q
cd frontend && npm run lint && npm run build
```

Both must pass. CI runs the same commands, plus a Docker image build.

## Guidelines

- Keep all ZAP coupling inside `backend/app/zap_client.py`,
  `backend/app/services/`, and the routers. The frontend must never call ZAP.
- Backend routes are async and return pydantic models; add a test for any new
  route in `backend/tests/test_api.py` using the `FakeZap` transport.
- Frontend: new views go under `src/features/<name>/`, shared widgets under
  `src/components/`. All HTTP goes through `src/api/client.ts`.
- Match the existing dark theme; prefer the utility classes in `src/index.css`
  (`panel`, `btn`, `input`, `chip`, `toolbar`) over ad-hoc styling.
- If you discover a new ZAP API quirk, document it in `AGENTS.md` so the next
  person does not have to rediscover it.

## Reporting issues

Include your ZAP version, how ZAP was started (managed vs external), the backend
log around the failure, and the exact request that reproduced it. Screenshots of
the workspace help for UI bugs.
