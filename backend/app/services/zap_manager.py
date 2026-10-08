"""Owns the OWASP ZAP daemon process lifecycle.

Responsibilities:
  * locate the ZAP install (or attach to an already-running daemon),
  * spawn ``zap.sh -daemon`` with the API enabled,
  * wait for the API to come up,
  * make sure a proxy local server exists (ZAP does not enable one in daemon mode).
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path

from app.config import Settings
from app.zap_client import ZapClient, ZapError

log = logging.getLogger("zapstudio.manager")

_CANDIDATE_DIRS = [
    "/opt/zaproxy",
    "/usr/share/zaproxy",
    "/opt/ZAP",
    str(Path.home() / "zaproxy"),
]


def find_zap() -> str | None:
    """Return the path to ``zap.sh`` if one can be found."""
    found = shutil.which("zap.sh") or shutil.which("zaproxy")
    if found:
        return found
    for base in _CANDIDATE_DIRS:
        candidate = Path(base) / "zap.sh"
        if candidate.exists():
            return str(candidate)
    # Last resort: scan a couple of common parent dirs for ZAP_*_Linux/zap.sh
    for parent in (Path("/opt"), Path("/usr/local"), Path.home()):
        if not parent.exists():
            continue
        try:
            for entry in parent.iterdir():
                if entry.is_dir() and entry.name.lower().startswith(("zap", "zaproxy")):
                    candidate = entry / "zap.sh"
                    if candidate.exists():
                        return str(candidate)
        except OSError:
            continue
    return None


class ZapManager:
    def __init__(self, settings: Settings, client: ZapClient):
        self._settings = settings
        self._client = client
        self._proc: asyncio.subprocess.Process | None = None
        self._external = False  # True when we attached to a running daemon
        self._zap_path: str | None = None
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ status
    @property
    def zap_path(self) -> str | None:
        return self._zap_path

    @property
    def managed(self) -> bool:
        return self._proc is not None

    @property
    def external(self) -> bool:
        return self._external

    def is_running(self) -> bool:
        if self._external:
            return True
        return self._proc is not None and self._proc.returncode is None

    async def version(self) -> str | None:
        try:
            return str(await self._client.view("core", "version"))
        except ZapError:
            return None

    # ------------------------------------------------------------------- start
    async def start(self) -> str:
        async with self._lock:
            if self.is_running() and await self.version():
                return "already-running"

            # Try to attach to something already listening first.
            try:
                version = str(await self._client.view("core", "version"))
                self._external = True
                self._zap_path = find_zap()
                log.info("Attached to an existing ZAP daemon (v%s)", version)
                await self.ensure_proxy()
                return "attached"
            except ZapError:
                pass

            if not self._settings.autostart_zap:
                raise ZapError("No ZAP daemon is running and autostart is disabled.",
                               code="zap_not_running", status=503)

            self._zap_path = self._settings.zap_path or find_zap()
            if not self._zap_path:
                raise ZapError(
                    "Could not find zap.sh. Install OWASP ZAP or set BURPZAP_ZAP_PATH.",
                    code="zap_not_installed", status=503,
                )

            await self._spawn()
            version = await self._client.wait_until_up(self._settings.zap_startup_timeout)
            await self.ensure_proxy()
            return version

    async def _spawn(self) -> None:
        home = self._settings.session_dir
        home.mkdir(parents=True, exist_ok=True)
        cmd = [
            self._zap_path,
            "-daemon",
            "-host", self._settings.zap_host,
            "-port", str(self._settings.zap_port),
            "-dir", str(home),
            "-config", f"api.key={self._settings.effective_zap_key}",
            "-config", "api.addrs.addr.name=.*",
            "-config", "api.addrs.addr.regex=true",
        ]
        env = os.environ.copy()
        env.setdefault("ZAP_JAVA_OPTS", "")
        log.info("Starting ZAP: %s", " ".join(cmd))
        self._proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
        )
        self._external = False

    # ------------------------------------------------------------------- proxy
    async def ensure_proxy(self) -> dict:
        """Make sure a proxy local server is listening, then return its config."""
        if not self._settings.manage_proxy:
            return {}
        servers = await self._client.view("network", "getLocalServers")
        proxy = next((s for s in servers if s.get("proxy")), None)
        if proxy is None:
            log.info("Enabling ZAP proxy on %s:%s", self._settings.proxy_host,
                     self._settings.proxy_port)
            await self._client.action(
                "network", "addLocalServer",
                address=self._settings.proxy_host,
                port=str(self._settings.proxy_port),
                api="false",
                proxy="true",
                behindNat="false",
                decodeResponse="false",
                removeAcceptEncoding="false",
            )
            servers = await self._client.view("network", "getLocalServers")
            proxy = next((s for s in servers if s.get("proxy")), None)
        return proxy or {}

    # -------------------------------------------------------------------- stop
    async def stop(self) -> None:
        async with self._lock:
            if self._proc is not None and self._proc.returncode is None:
                log.info("Shutting ZAP down")
                try:
                    await self._client.action("core", "shutdown")
                except ZapError:
                    pass
                try:
                    await asyncio.wait_for(self._proc.wait(), timeout=20)
                except asyncio.TimeoutError:
                    self._proc.kill()
                    await self._proc.wait()
            self._proc = None
            self._external = False
