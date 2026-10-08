"""Target / site map, contexts, and message search."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import ClientDep
from app.zap_client import ZapError

router = APIRouter(prefix="/api/target", tags=["target"])


@router.get("/sites")
async def sites(client: ClientDep) -> dict:
    try:
        return {"sites": await client.view("core", "sites")}
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.get("/urls")
async def urls(client: ClientDep, baseurl: str) -> dict:
    return {"urls": await client.view("core", "urls", baseurl=baseurl)}


@router.get("/hosts")
async def hosts(client: ClientDep) -> dict:
    return {"hosts": await client.view("core", "hosts")}


class AccessRequest(BaseModel):
    url: str
    followRedirects: bool = True


@router.post("/access")
async def access(client: ClientDep, payload: AccessRequest) -> dict:
    """Send a URL through the proxy so it appears in the site map/history."""
    try:
        await client.action("core", "accessUrl", url=payload.url,
                            followRedirects="true" if payload.followRedirects else "false")
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return {"status": "ok"}


@router.get("/excluded")
async def excluded(client: ClientDep) -> dict:
    return {"excluded": await client.view("core", "excludedFromProxy")}


class ExcludeRequest(BaseModel):
    regex: str


@router.post("/excluded")
async def add_excluded(client: ClientDep, payload: ExcludeRequest) -> dict:
    await client.action("core", "excludeFromProxy", regex=payload.regex)
    return {"status": "ok"}


@router.delete("/excluded")
async def remove_excluded(client: ClientDep, regex: str) -> dict:
    await client.action("core", "clearExcludedFromProxy", regex=regex)
    return {"status": "ok"}


@router.get("/contexts")
async def contexts(client: ClientDep) -> dict:
    names = await client.view("context", "contextList")
    return {"contexts": names or []}


@router.get("/search")
async def search(client: ClientDep, kind: str = Query(default="url", pattern="^(url|request|response|header|note|tag)$"),
                 regex: str = "", baseurl: str | None = None) -> dict:
    mapping = {
        "url": ("search", "urlsByUrlRegex"),
        "request": ("search", "urlsByRequestRegex"),
        "response": ("search", "urlsByResponseRegex"),
        "header": ("search", "urlsByHeaderRegex"),
        "note": ("search", "urlsByNoteRegex"),
        "tag": ("search", "urlsByTagRegex"),
    }
    component, name = mapping[kind]
    try:
        result = await client.view(component, name, regex=regex, baseurl=baseurl)
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return {"kind": kind, "regex": regex, "result": result}
