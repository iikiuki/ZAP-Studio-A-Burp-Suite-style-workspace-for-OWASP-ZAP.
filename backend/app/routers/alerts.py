"""Alerts (findings) routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import BusDep, ClientDep
from app.zap_client import ZapError

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class Alert(BaseModel):
    id: str
    name: str
    risk: str
    confidence: str
    url: str
    param: str
    attack: str
    evidence: str
    description: str
    solution: str
    reference: str
    cweId: str
    wascId: str
    sourceId: str
    alertRef: str
    pluginId: str
    messageId: str
    method: str
    tags: dict[str, str]


def _tags(raw: dict[str, Any]) -> dict[str, str]:
    tags = raw.get("tags") or {}
    if isinstance(tags, dict):
        return {str(k): str(v) for k, v in tags.items()}
    return {str(t.get("key", "")): str(t.get("value", "")) for t in tags if isinstance(t, dict)}


def _alert(raw: dict[str, Any]) -> Alert:
    return Alert(
        id=str(raw.get("id", "")),
        name=raw.get("alert") or raw.get("name") or "",
        risk=raw.get("risk", ""),
        confidence=raw.get("confidence", ""),
        url=raw.get("url", ""),
        param=raw.get("param", ""),
        attack=raw.get("attack", ""),
        evidence=raw.get("evidence", ""),
        description=raw.get("description", ""),
        solution=raw.get("solution", ""),
        reference=raw.get("reference", ""),
        cweId=str(raw.get("cweid", "")),
        wascId=str(raw.get("wascid", "")),
        sourceId=str(raw.get("sourceid", "")),
        alertRef=str(raw.get("alertRef", "")),
        pluginId=str(raw.get("pluginId", "")),
        messageId=str(raw.get("messageId", "")),
        method=raw.get("method", ""),
        tags=_tags(raw),
    )


@router.get("", response_model=list[Alert])
async def list_alerts(client: ClientDep, baseurl: str | None = None, start: int = 0,
                      count: int = Query(default=200, le=2000),
                      riskId: str | None = None) -> list[Alert]:
    try:
        data = await client.view("alert", "alerts", baseurl=baseurl, start=start,
                                 count=count, riskId=riskId)
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    items = data if isinstance(data, list) else (data.get("alerts", []) if isinstance(data, dict) else [])
    return [_alert(item) for item in items]


@router.get("/summary")
async def summary(client: ClientDep, baseurl: str | None = None) -> dict:
    try:
        return await client.view_raw("alert", "alertsSummary", baseurl=baseurl)
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.get("/counts")
async def counts(client: ClientDep) -> dict:
    return await client.view_raw("alert", "alertCountsByRisk")


@router.get("/count")
async def count(client: ClientDep, baseurl: str | None = None) -> dict:
    return {"count": int(await client.view("core", "numberOfAlerts", baseurl=baseurl))}


@router.delete("/{alert_id}")
async def delete(client: ClientDep, bus: BusDep, alert_id: str) -> dict:
    await client.action("alert", "deleteAlert", id=alert_id)
    bus.publish("alerts", {"count": int(await client.view("core", "numberOfAlerts")), "new": 0})
    return {"status": "ok"}


@router.post("/clear")
async def clear(client: ClientDep, bus: BusDep) -> dict:
    await client.action("alert", "deleteAllAlerts")
    bus.publish("alerts", {"count": 0, "new": 0})
    return {"status": "ok"}


class AlertUpdate(BaseModel):
    id: str
    risk: str | None = None
    confidence: str | None = None


@router.post("/update")
async def update(client: ClientDep, payload: AlertUpdate) -> dict:
    if payload.risk is not None:
        await client.action("alert", "updateAlertsRisk", id=payload.id, risk=payload.risk)
    if payload.confidence is not None:
        await client.action("alert", "updateAlertsConfidence", id=payload.id,
                            confidence=payload.confidence)
    return {"status": "ok"}
