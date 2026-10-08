"""Thin async client over the OWASP ZAP daemon REST API.

Only this module and :mod:`app.services.zap_manager` are allowed to know about
ZAP's HTTP surface. Everything above speaks plain domain models.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import Settings

log = logging.getLogger("zapstudio.zap")


class ZapError(RuntimeError):
    """Raised when ZAP returns an error payload or is unreachable."""

    def __init__(self, message: str, *, code: str = "zap_error", status: int = 502):
        super().__init__(message)
        self.code = code
        self.status = status


class ZapClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.api_url,
            timeout=httpx.Timeout(settings.request_timeout, connect=10.0),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    @property
    def base_url(self) -> str:
        return self._settings.api_url

    async def _request(self, method: str, component: str, kind: str, name: str,
                       params: dict[str, Any] | None = None) -> dict[str, Any]:
        params = {k: v for k, v in (params or {}).items() if v is not None}
        params["apikey"] = self._settings.effective_zap_key
        url = f"/{component}/{kind}/{name}/"
        try:
            resp = await self._client.request(method, url, params=params)
        except httpx.HTTPError as exc:  # connection refused, timeout, ...
            raise ZapError(f"ZAP is unreachable: {exc}", code="zap_unreachable", status=503) from exc

        if resp.status_code >= 400:
            payload: dict[str, Any] = {}
            try:
                payload = resp.json()
            except ValueError:
                payload = {"message": resp.text[:300]}
            code = payload.get("code", "zap_error")
            message = payload.get("message", resp.text[:300] or "ZAP request failed")
            raise ZapError(f"ZAP {component}/{kind}/{name}: {message}", code=code,
                           status=400 if resp.status_code < 500 else 502)
        try:
            return resp.json()
        except ValueError as exc:
            raise ZapError(f"ZAP returned non-JSON for {component}/{kind}/{name}",
                           code="bad_response") from exc

    async def view(self, component: str, name: str, **params: Any) -> Any:
        """Call a ZAP view (read-only). Returns the single value under its key."""
        data = await self._request("GET", component, "view", name, params)
        return _unwrap(data)

    async def view_raw(self, component: str, name: str, **params: Any) -> dict[str, Any]:
        """Like :meth:`view` but returns the raw payload.

        Use this when the response *is* a map (e.g. ``alertCountsByRisk``),
        where unwrapping a single-key dict would destroy the data.
        """
        return await self._request("GET", component, "view", name, params)

    async def action(self, component: str, name: str, **params: Any) -> Any:
        """Call a ZAP action.

        ZAP 2.17 rejects form-encoded POST bodies with ``content_type_not_supported``,
        so actions are always issued as GET requests with query parameters.
        """
        data = await self._request("GET", component, "action", name, params)
        return _unwrap(data)

    async def other(self, component: str, name: str, **params: Any) -> httpx.Response:
        """Call a ZAP 'other' endpoint (raw payloads: HAR, reports, certificates)."""
        params = {k: v for k, v in params.items() if v is not None}
        params["apikey"] = self._settings.effective_zap_key
        try:
            return await self._client.get(f"/{component}/other/{name}/", params=params)
        except httpx.HTTPError as exc:
            raise ZapError(f"ZAP is unreachable: {exc}", code="zap_unreachable", status=503) from exc

    async def wait_until_up(self, timeout: float, interval: float = 2.0) -> str:
        """Poll ``core/view/version`` until ZAP answers. Returns the version."""
        deadline = asyncio.get_event_loop().time() + timeout
        last: Exception | None = None
        while asyncio.get_event_loop().time() < deadline:
            try:
                return str(await self.view("core", "version"))
            except ZapError as exc:
                last = exc
                await asyncio.sleep(interval)
        raise ZapError(f"ZAP did not become ready within {timeout:.0f}s ({last})",
                       code="zap_timeout", status=504)


def _unwrap(data: dict[str, Any]) -> Any:
    """ZAP wraps values in a single key, e.g. ``{"version": "2.17.0"}``."""
    if isinstance(data, dict) and len(data) == 1:
        return next(iter(data.values()))
    return data
