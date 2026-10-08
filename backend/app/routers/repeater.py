"""Repeater: send an arbitrary raw request through ZAP and get the full exchange."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.deps import ClientDep
from app.services.messages import build_request, parse_request, parse_response
from app.zap_client import ZapError

router = APIRouter(prefix="/api/repeater", tags=["repeater"])


class RepeaterRequest(BaseModel):
    raw: str | None = None
    method: str | None = None
    url: str | None = None
    headers: list[dict[str, str]] | None = None
    body: str = ""
    followRedirects: bool = False


@router.post("/send")
async def send(client: ClientDep, payload: RepeaterRequest) -> dict:
    if payload.raw:
        raw = payload.raw
    elif payload.url:
        raw = build_request(payload.method or "GET", payload.url,
                            payload.headers or [], payload.body)
    else:
        raise HTTPException(status_code=422, detail="Provide either 'raw' or 'url'.")

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
