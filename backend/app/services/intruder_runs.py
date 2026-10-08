"""Tracks long-running Intruder attacks so they can be streamed and cancelled."""
from __future__ import annotations

import asyncio
import uuid

from app.services.intruder import IntruderConfig, IntruderResult, IntruderRun
from app.zap_client import ZapClient


class ManagedRun:
    def __init__(self, run_id: str, run: IntruderRun):
        self.id = run_id
        self.run = run
        self.results: list[IntruderResult] = []
        self.finished = asyncio.Event()
        self._consumers: set[asyncio.Queue] = set()
        self._task: asyncio.Task | None = None

    def add_consumer(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._consumers.add(queue)
        for result in self.results:
            queue.put_nowait(result)
        return queue

    def remove_consumer(self, queue: asyncio.Queue) -> None:
        self._consumers.discard(queue)

    def _broadcast(self, result: IntruderResult) -> None:
        for queue in list(self._consumers):
            queue.put_nowait(result)

    async def start(self) -> None:
        async def pump() -> None:
            try:
                async for result in self.run.stream():
                    self.results.append(result)
                    self._broadcast(result)
            finally:
                self.finished.set()
                for queue in list(self._consumers):
                    queue.put_nowait(None)

        self._task = asyncio.create_task(pump())

    def cancel(self) -> None:
        self.run.cancel()
        if self._task and not self._task.done():
            self._task.cancel()


class IntruderRunManager:
    def __init__(self, client: ZapClient, max_runs: int = 20):
        self._client = client
        self._runs: dict[str, ManagedRun] = {}
        self._max_runs = max_runs

    def create(self, config: IntruderConfig) -> ManagedRun:
        if len(self._runs) >= self._max_runs:
            finished = [r for r in self._runs.values() if r.finished.is_set()]
            for stale in finished[: max(1, len(finished) // 2)]:
                self._runs.pop(stale.id, None)
        run_id = uuid.uuid4().hex[:12]
        managed = ManagedRun(run_id, IntruderRun(self._client, config))
        self._runs[run_id] = managed
        return managed

    def get(self, run_id: str) -> ManagedRun | None:
        return self._runs.get(run_id)
