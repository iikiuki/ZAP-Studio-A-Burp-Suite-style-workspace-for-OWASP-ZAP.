"""Shared FastAPI dependencies pulled from ``app.state``."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings
from app.services.events import EventBus
from app.services.intruder_runs import IntruderRunManager
from app.services.zap_manager import ZapManager
from app.zap_client import ZapClient


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_client(request: Request) -> ZapClient:
    return request.app.state.zap_client


def get_manager(request: Request) -> ZapManager:
    return request.app.state.zap_manager


def get_bus(request: Request) -> EventBus:
    return request.app.state.bus


def get_intruder_runs(request: Request) -> IntruderRunManager:
    return request.app.state.intruder_runs


SettingsDep = Annotated[Settings, Depends(get_settings)]
ClientDep = Annotated[ZapClient, Depends(get_client)]
ManagerDep = Annotated[ZapManager, Depends(get_manager)]
BusDep = Annotated[EventBus, Depends(get_bus)]
IntruderRunsDep = Annotated[IntruderRunManager, Depends(get_intruder_runs)]
