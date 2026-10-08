"""Intruder engine.

OWASP ZAP's fuzzer add-on exposes no JSON API, so the Intruder is implemented here
on top of ``core/action/sendRequest``. Attack types mirror Burp Suite:

  * ``sniper``        — one placeholder at a time, one payload set
  * ``batteringram``  — every placeholder gets the same payload value
  * ``pitchfork``     — placeholders advance in lock-step
  * ``clusterbomb``   — cartesian product of all payload sets
"""
from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable

from app.zap_client import ZapClient, ZapError
from app.services.messages import parse_response, split_message

MARKER_RE = re.compile(r"§([^§]*)§")


@dataclass
class IntruderConfig:
    request: str
    attack_type: str = "sniper"
    payload_sets: list[list[str]] = field(default_factory=list)
    threads: int = 10
    delay_ms: int = 0
    follow_redirects: bool = False


def placeholders(request: str) -> list[str]:
    """Return the marker positions in order, including empty ones."""
    return MARKER_RE.findall(request)


def _render(request: str, values: list[str]) -> str:
    it = iter(values)
    return MARKER_RE.sub(lambda _m: next(it, ""), request)


def generate_requests(cfg: IntruderConfig) -> list[tuple[list[str], str]]:
    """Return ``[(payloads, raw_request), ...]`` for the configured attack."""
    markers = placeholders(cfg.request)
    n = len(markers)
    sets = cfg.payload_sets or [[]]
    out: list[tuple[list[str], str]] = []

    if n == 0:
        # No markers: Burp sends the request once, unchanged.
        return [([], cfg.request)]

    if cfg.attack_type == "sniper":
        base = sets[0] if sets else []
        for idx in range(n):
            for value in base:
                values = [markers[i] for i in range(n)]
                values[idx] = value
                out.append(([value], _render(cfg.request, values)))
    elif cfg.attack_type == "batteringram":
        base = sets[0] if sets else []
        for value in base:
            out.append(([value] * n, _render(cfg.request, [value] * n)))
    elif cfg.attack_type == "pitchfork":
        columns = [sets[i] if i < len(sets) else [] for i in range(n)]
        for row in zip(*columns):
            row = list(row)
            out.append((row, _render(cfg.request, row)))
    elif cfg.attack_type == "clusterbomb":
        def product(idx: int, acc: list[str]) -> None:
            if idx == n:
                out.append((list(acc), _render(cfg.request, acc)))
                return
            column = sets[idx] if idx < len(sets) else []
            for value in column:
                acc.append(value)
                product(idx + 1, acc)
                acc.pop()
        product(0, [])
    else:
        raise ValueError(f"Unknown attack type: {cfg.attack_type}")
    return out


@dataclass
class IntruderResult:
    index: int
    payloads: list[str]
    status: int
    length: int
    rtt: int
    request_header: str
    response_header: str
    response_body: str
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "index": self.index, "payloads": self.payloads, "status": self.status,
            "length": self.length, "rtt": self.rtt,
            "requestHeader": self.request_header, "responseHeader": self.response_header,
            "responseBody": self.response_body, "error": self.error,
        }


class IntruderRun:
    """A single Intruder attack. Iterate :meth:`stream` for results."""

    def __init__(self, client: ZapClient, cfg: IntruderConfig):
        self._client = client
        self._cfg = cfg
        self._requests = generate_requests(cfg)
        self._cancelled = False

    @property
    def total(self) -> int:
        return len(self._requests)

    def cancel(self) -> None:
        self._cancelled = True

    async def stream(self) -> AsyncIterator[IntruderResult]:
        cfg = self._cfg
        sem = asyncio.Semaphore(max(1, cfg.threads))
        queue: asyncio.Queue[IntruderResult | None] = asyncio.Queue()
        emitted = 0

        async def worker(index: int, payloads: list[str], raw: str) -> None:
            nonlocal emitted
            if self._cancelled:
                return
            async with sem:
                if self._cancelled:
                    return
                if cfg.delay_ms:
                    await asyncio.sleep(cfg.delay_ms / 1000)
                result = await self._send(index, payloads, raw)
                await queue.put(result)

        tasks = [
            asyncio.create_task(worker(i, payloads, raw))
            for i, (payloads, raw) in enumerate(self._requests)
        ]
        total = len(tasks)
        try:
            while emitted < total:
                item = await queue.get()
                if item is None:
                    break
                emitted += 1
                yield item
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _send(self, index: int, payloads: list[str], raw: str) -> IntruderResult:
        try:
            data = await self._client.action(
                "core", "sendRequest", request=raw,
                followRedirects="true" if self._cfg.follow_redirects else "false",
            )
            messages = data if isinstance(data, list) else [data]
            first = messages[0] if messages else {}
            last = messages[-1] if messages else {}
            parsed = parse_response(last.get("responseHeader", "") + "\n\n"
                                    + last.get("responseBody", ""))
            return IntruderResult(
                index=index, payloads=payloads, status=parsed["status"],
                length=parsed["length"], rtt=int(last.get("rtt") or 0),
                request_header=first.get("requestHeader", ""),
                response_header=last.get("responseHeader", ""),
                response_body=last.get("responseBody", ""),
            )
        except ZapError as exc:
            return IntruderResult(
                index=index, payloads=payloads, status=0, length=0, rtt=0,
                request_header=raw, response_header="", response_body="",
                error=str(exc),
            )


def substitute_request(raw: str, values: list[str]) -> str:
    """Helper used by the Repeater to apply user substitutions."""
    it = iter(values)
    return MARKER_RE.sub(lambda _m: next(it, ""), raw)
