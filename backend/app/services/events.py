"""In-process pub/sub plus the background poller that mirrors ZAP state.

ZAP has no push channel, so we poll cheap counters (message count, alert count,
scan states, break state) and fan changes out to connected websocket clients.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

from app.services.zap_manager import ZapManager
from app.zap_client import ZapClient, ZapError

log = logging.getLogger("zapstudio.events")


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=1000)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    def publish(self, channel: str, data: Any) -> None:
        event = {"channel": channel, "data": data}
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Slow consumer: drop the oldest event to make room.
                with contextlib.suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
                with contextlib.suppress(asyncio.QueueFull):
                    queue.put_nowait(event)


class ZapPoller:
    """Watches ZAP for new history entries, alerts, scan state and breakpoints."""

    def __init__(self, client: ZapClient, manager: ZapManager, bus: EventBus,
                 interval: float = 2.0):
        self._client = client
        self._manager = manager
        self._bus = bus
        self._interval = interval
        self._task: asyncio.Task | None = None
        self._seen_messages = 0
        self._seen_alerts = 0
        self._scan_states: dict[str, str] = {}
        self._break_state = False

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop(), name="zap-poller")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _loop(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # never let the poller die
                log.debug("poller tick failed: %s", exc)
            await asyncio.sleep(self._interval)

    async def _tick(self) -> None:
        if not self._manager.is_running():
            return
        try:
            messages = int(await self._client.view("core", "numberOfMessages"))
            alerts = int(await self._client.view("core", "numberOfAlerts"))
        except ZapError:
            return

        if messages != self._seen_messages:
            new = max(0, messages - self._seen_messages)
            self._seen_messages = messages
            self._bus.publish("history", {"count": messages, "new": new})
        if alerts != self._seen_alerts:
            new = max(0, alerts - self._seen_alerts)
            self._seen_alerts = alerts
            self._bus.publish("alerts", {"count": alerts, "new": new})

        await self._poll_scans("spider")
        await self._poll_scans("ascan")
        await self._poll_break()

    async def _poll_scans(self, component: str) -> None:
        try:
            scans = await self._client.view(component, "scans")
        except ZapError:
            return
        for scan in scans or []:
            sid = str(scan.get("id"))
            state = scan.get("state", "")
            key = f"{component}:{sid}"
            if self._scan_states.get(key) != state:
                self._scan_states[key] = state
                self._bus.publish("scan", {"component": component, "scan": scan})

    async def _poll_break(self) -> None:
        try:
            state = str(await self._client.view("break", "isBreakAll")) == "true"
        except ZapError:
            return
        if state != self._break_state:
            self._break_state = state
            message = ""
            if state:
                with contextlib.suppress(ZapError):
                    message = str(await self._client.view("break", "httpMessage"))
            self._bus.publish("intercept", {"active": state, "message": message})
