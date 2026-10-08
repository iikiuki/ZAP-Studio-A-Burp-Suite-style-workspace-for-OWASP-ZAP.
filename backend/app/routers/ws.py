"""WebSocket endpoint that fans out ZAP state changes to the UI."""
from __future__ import annotations

import asyncio
import contextlib
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.deps import get_bus, get_client, get_manager

router = APIRouter()


@router.websocket("/ws")
async def events(websocket: WebSocket) -> None:
    await websocket.accept()
    bus = get_bus(websocket)  # type: ignore[arg-type]
    client = get_client(websocket)  # type: ignore[arg-type]
    manager = get_manager(websocket)  # type: ignore[arg-type]
    queue = bus.subscribe()

    async def initial_state() -> dict:
        state: dict = {"zap": {"running": manager.is_running()}}
        if manager.is_running():
            with contextlib.suppress(Exception):
                state["history"] = {"count": int(await client.view("core", "numberOfMessages"))}
            with contextlib.suppress(Exception):
                state["alerts"] = {"count": int(await client.view("core", "numberOfAlerts"))}
        return state

    try:
        await websocket.send_text(json.dumps({"channel": "hello", "data": await initial_state()}))
        while True:
            event = await queue.get()
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception:
        with contextlib.suppress(Exception):
            await websocket.close()
    finally:
        bus.unsubscribe(queue)
