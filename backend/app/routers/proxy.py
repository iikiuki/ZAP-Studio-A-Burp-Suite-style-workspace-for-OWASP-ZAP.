"""Proxy history, intercept (breakpoints), and manual request sending."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import BusDep, ClientDep
from app.services.messages import build_request, parse_request, parse_response
from app.zap_client import ZapError

router = APIRouter(prefix="/api/proxy", tags=["proxy"])


class HistoryItem(BaseModel):
    id: str
    timestamp: int
    method: str
    url: str
    host: str
    path: str
    status: int
    length: int
    rtt: int
    mimeType: str
    note: str
    tags: list[str]


def _mime_type(headers: list[dict[str, str]]) -> str:
    for header in headers:
        if header["name"].lower() == "content-type":
            return header["value"].split(";")[0].strip()
    return ""


def _to_history(raw: dict[str, Any]) -> HistoryItem:
    request = parse_request(raw.get("requestHeader", ""))
    response = parse_response(raw.get("responseHeader", "") + "\n\n"
                              + raw.get("responseBody", ""))
    return HistoryItem(
        id=str(raw.get("id", "")),
        timestamp=int(raw.get("timestamp") or 0),
        method=request["method"],
        url=request["url"],
        host=request["host"],
        path=request["path"],
        status=response["status"],
        length=response["length"],
        rtt=int(raw.get("rtt") or 0),
        mimeType=_mime_type(response["headers"]),
        note=raw.get("note", ""),
        tags=raw.get("tags") or [],
    )


@router.get("/history", response_model=list[HistoryItem])
async def history(client: ClientDep, baseurl: str | None = None,
                  start: int = 0, count: int = Query(default=100, le=1000)) -> list[HistoryItem]:
    try:
        data = await client.view("core", "messages", baseurl=baseurl,
                                 start=start, count=count)
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    items = data if isinstance(data, list) else (data.get("messages", []) if isinstance(data, dict) else [])
    return [_to_history(item) for item in items]


@router.get("/history/count")
async def history_count(client: ClientDep) -> dict:
    return {"count": int(await client.view("core", "numberOfMessages"))}


@router.get("/message/{message_id}")
async def message(client: ClientDep, message_id: str) -> dict:
    try:
        data = await client.view("core", "message", id=message_id)
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    raw = data if isinstance(data, dict) else {}
    return {
        "id": message_id,
        "request": parse_request(raw.get("requestHeader", "")),
        "requestRaw": raw.get("requestHeader", "") + "\n\n" + raw.get("requestBody", ""),
        "response": parse_response(raw.get("responseHeader", "") + "\n\n"
                                   + raw.get("responseBody", "")),
        "responseRaw": raw.get("responseHeader", "") + "\n\n" + raw.get("responseBody", ""),
    }


@router.post("/history/clear")
async def clear_history(client: ClientDep, bus: BusDep) -> dict:
    await client.action("core", "deleteAllAlerts")
    # ZAP has no "delete all messages" action; a new session clears history.
    await client.action("core", "newSession", overwrite="true")
    bus.publish("history", {"count": 0, "new": 0})
    return {"status": "ok"}


class SendRequest(BaseModel):
    method: str = "GET"
    url: str
    headers: list[dict[str, str]] | None = None
    body: str = ""
    raw: str | None = None
    followRedirects: bool = False


@router.post("/send")
async def send(client: ClientDep, payload: SendRequest) -> dict:
    raw = payload.raw or build_request(payload.method, payload.url,
                                       payload.headers or [], payload.body)
    try:
        data = await client.action("core", "sendRequest", request=raw,
                                   followRedirects="true" if payload.followRedirects else "false")
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    messages = data if isinstance(data, list) else [data]
    first = messages[0] if messages else {}
    last = messages[-1] if messages else {}
    return {
        "request": parse_request(first.get("requestHeader", "")),
        "requestRaw": first.get("requestHeader", "") + "\n\n" + first.get("requestBody", ""),
        "response": parse_response(last.get("responseHeader", "") + "\n\n"
                                   + last.get("responseBody", "")),
        "responseRaw": last.get("responseHeader", "") + "\n\n" + last.get("responseBody", ""),
        "rtt": int(last.get("rtt") or 0),
        "redirects": len(messages) - 1,
    }


# --------------------------------------------------------------------- intercept
class BreakRequest(BaseModel):
    active: bool
    type: str = "http"
    scope: str | None = None


@router.get("/intercept")
async def intercept_state(client: ClientDep) -> dict:
    active = str(await client.view("break", "isBreakAll")) == "true"
    message = ""
    if active:
        try:
            message = str(await client.view("break", "httpMessage"))
        except ZapError:
            message = ""
    return {"active": active, "message": message}


@router.post("/intercept")
async def set_intercept(client: ClientDep, bus: BusDep, payload: BreakRequest) -> dict:
    await client.action("break", "break", type=payload.type,
                        state="true" if payload.active else "false",
                        scope=payload.scope)
    bus.publish("intercept", {"active": payload.active})
    return {"active": payload.active}


class ContinueRequest(BaseModel):
    action: str = "continue"  # continue | step | drop
    message: str | None = None


@router.post("/intercept/continue")
async def continue_intercept(client: ClientDep, payload: ContinueRequest) -> dict:
    if payload.message is not None:
        await client.action("break", "setHttpMessage", httpHeader=payload.message,
                            httpBody="")
    if payload.action == "step":
        await client.action("break", "step")
    elif payload.action == "drop":
        await client.action("break", "drop")
    else:
        await client.action("break", "continue")
    return {"status": "ok"}


@router.get("/breakpoint")
async def breakpoint(client: ClientDep) -> dict:
    try:
        message = str(await client.view("break", "httpMessage"))
    except ZapError:
        message = ""
    if not message:
        return {"active": False, "message": "", "request": None}
    return {"active": True, "message": message, "request": parse_request(message)}
