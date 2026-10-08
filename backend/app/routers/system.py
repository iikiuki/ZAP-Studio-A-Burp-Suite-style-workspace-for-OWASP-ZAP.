"""System / ZAP lifecycle routes."""
from __future__ import annotations

import platform

from fastapi import APIRouter
from pydantic import BaseModel

from app.deps import ClientDep, ManagerDep, SettingsDep
from app.zap_client import ZapError

router = APIRouter(prefix="/api/system", tags=["system"])


class ZapStatus(BaseModel):
    running: bool
    version: str | None
    managed: bool
    external: bool
    zapPath: str | None
    apiUrl: str
    proxy: dict | None
    autostart: bool
    platform: str


class StartResponse(BaseModel):
    status: str
    version: str | None


@router.get("/status", response_model=ZapStatus)
async def status(settings: SettingsDep, client: ClientDep, manager: ManagerDep) -> ZapStatus:
    version = await manager.version()
    proxy = None
    if version:
        try:
            servers = await client.view("network", "getLocalServers")
            proxy = next((s for s in servers if s.get("proxy")), None)
        except ZapError:
            proxy = None
    return ZapStatus(
        running=version is not None,
        version=version,
        managed=manager.managed,
        external=manager.external,
        zapPath=manager.zap_path,
        apiUrl=client.base_url,
        proxy=proxy,
        autostart=settings.autostart_zap,
        platform=f"{platform.system()} {platform.release()}",
    )


@router.post("/zap/start", response_model=StartResponse)
async def start(manager: ManagerDep) -> StartResponse:
    result = await manager.start()
    return StartResponse(status=result, version=await manager.version())


@router.post("/zap/stop")
async def stop(manager: ManagerDep) -> dict:
    await manager.stop()
    return {"status": "stopped"}


@router.post("/zap/proxy")
async def ensure_proxy(manager: ManagerDep) -> dict:
    return {"proxy": await manager.ensure_proxy()}


@router.post("/session/new")
async def new_session(client: ClientDep, name: str = "", overwrite: bool = True) -> dict:
    await client.action("core", "newSession", name=name or None,
                        overwrite="true" if overwrite else "false")
    return {"status": "ok"}


@router.post("/session/save")
async def save_session(client: ClientDep, name: str) -> dict:
    location = await client.action("core", "saveSession", name=name)
    return {"location": location}


@router.post("/gc")
async def run_gc(client: ClientDep) -> dict:
    await client.action("core", "runGarbageCollection")
    return {"status": "ok"}
