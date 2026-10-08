"""ZAP Studio backend — a Burp-style control plane in front of OWASP ZAP."""
from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import (alerts, intruder, proxy, repeater, reports, scans,
                         system, targets, tools, ws)
from app.services.events import EventBus, ZapPoller
from app.services.intruder_runs import IntruderRunManager
from app.services.zap_manager import ZapManager
from app.zap_client import ZapClient, ZapError

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("zapstudio")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = ZapClient(settings)
    manager = ZapManager(settings, client)
    bus = EventBus()
    poller = ZapPoller(client, manager, bus)
    app.state.settings = settings
    app.state.zap_client = client
    app.state.zap_manager = manager
    app.state.bus = bus
    app.state.poller = poller
    app.state.intruder_runs = IntruderRunManager(client)

    if settings.autostart_zap:
        try:
            log.info("Starting ZAP...")
            await manager.start()
        except ZapError as exc:
            log.warning("ZAP did not start automatically: %s", exc)
    poller.start()
    try:
        yield
    finally:
        await poller.stop()
        await client.aclose()


app = FastAPI(title="ZAP Studio API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ZapError)
async def zap_error_handler(_request: Request, exc: ZapError) -> JSONResponse:
    return JSONResponse(status_code=exc.status,
                        content={"detail": str(exc), "code": exc.code})


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


for module in (system, targets, proxy, scans, alerts, repeater, intruder, reports, tools):
    app.include_router(module.router)
app.include_router(ws.router)


def _mount_frontend() -> None:
    """Serve the built SPA if it exists (production / docker image)."""
    import os
    from pathlib import Path

    candidates = [
        Path(os.environ.get("BURPZAP_STATIC_DIR", "")) if os.environ.get("BURPZAP_STATIC_DIR") else None,
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
        Path("/app/static"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_dir() and (candidate / "index.html").exists():
            app.mount("/", StaticFiles(directory=str(candidate), html=True), name="spa")
            log.info("Serving frontend from %s", candidate)
            return


_mount_frontend()
