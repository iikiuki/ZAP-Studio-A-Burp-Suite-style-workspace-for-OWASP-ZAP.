"""Spider, AJAX spider, active scan and passive scan routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.deps import BusDep, ClientDep
from app.zap_client import ZapError

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _fail(exc: ZapError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=str(exc))


# ------------------------------------------------------------------- spider
@router.get("/spider")
async def spider_scans(client: ClientDep) -> dict:
    return {"scans": await client.view("spider", "scans") or []}


class SpiderRequest(BaseModel):
    url: str
    maxChildren: str | None = None
    recurse: bool = True
    subtreeOnly: bool = False
    contextName: str | None = None


@router.post("/spider")
async def spider_start(client: ClientDep, bus: BusDep, payload: SpiderRequest) -> dict:
    try:
        scan_id = await client.action(
            "spider", "scan", url=payload.url, maxChildren=payload.maxChildren,
            recurse="true" if payload.recurse else "false",
            subtreeOnly="true" if payload.subtreeOnly else "false",
            contextName=payload.contextName,
        )
    except ZapError as exc:
        raise _fail(exc) from exc
    bus.publish("scan", {"component": "spider", "scan": {"id": scan_id, "state": "RUNNING"}})
    return {"scanId": str(scan_id)}


@router.get("/spider/{scan_id}/status")
async def spider_status(client: ClientDep, scan_id: str) -> dict:
    try:
        return {"scanId": scan_id, "state": str(await client.view("spider", "status", scanId=scan_id))}
    except ZapError as exc:
        raise _fail(exc) from exc


@router.get("/spider/{scan_id}/results")
async def spider_results(client: ClientDep, scan_id: str) -> dict:
    return {"urls": await client.view("spider", "fullResults", scanId=scan_id) or []}


@router.post("/spider/{scan_id}/stop")
async def spider_stop(client: ClientDep, scan_id: str) -> dict:
    await client.action("spider", "stop", scanId=scan_id)
    return {"status": "ok"}


@router.post("/spider/stop-all")
async def spider_stop_all(client: ClientDep) -> dict:
    await client.action("spider", "stopAllScans")
    return {"status": "ok"}


# --------------------------------------------------------------- ajax spider
@router.get("/ajax")
async def ajax_status(client: ClientDep) -> dict:
    return {"state": str(await client.view("ajaxSpider", "status"))}


class AjaxRequest(BaseModel):
    url: str
    inScope: bool = False
    subtreeOnly: bool = False


@router.post("/ajax")
async def ajax_start(client: ClientDep, bus: BusDep, payload: AjaxRequest) -> dict:
    try:
        await client.action("ajaxSpider", "scan", url=payload.url,
                            inScope="true" if payload.inScope else "false",
                            subtreeOnly="true" if payload.subtreeOnly else "false")
    except ZapError as exc:
        raise _fail(exc) from exc
    bus.publish("scan", {"component": "ajaxSpider", "scan": {"state": "RUNNING"}})
    return {"status": "started"}


@router.post("/ajax/stop")
async def ajax_stop(client: ClientDep) -> dict:
    await client.action("ajaxSpider", "stop")
    return {"status": "ok"}


@router.get("/ajax/results")
async def ajax_results(client: ClientDep, start: int = 0, count: int = 100) -> dict:
    return {"results": await client.view("ajaxSpider", "results", start=start, count=count) or []}


# --------------------------------------------------------------- active scan
@router.get("/ascan")
async def ascan_scans(client: ClientDep) -> dict:
    return {"scans": await client.view("ascan", "scans") or []}


class ActiveScanRequest(BaseModel):
    url: str
    recurse: bool = True
    inScopeOnly: bool = False
    scanPolicyName: str | None = None
    method: str | None = None
    postData: str | None = None
    contextId: str | None = None


@router.post("/ascan")
async def ascan_start(client: ClientDep, bus: BusDep, payload: ActiveScanRequest) -> dict:
    try:
        scan_id = await client.action(
            "ascan", "scan", url=payload.url,
            recurse="true" if payload.recurse else "false",
            inScopeOnly="true" if payload.inScopeOnly else "false",
            scanPolicyName=payload.scanPolicyName, method=payload.method,
            postData=payload.postData, contextId=payload.contextId,
        )
    except ZapError as exc:
        raise _fail(exc) from exc
    bus.publish("scan", {"component": "ascan", "scan": {"id": scan_id, "state": "RUNNING"}})
    return {"scanId": str(scan_id)}


@router.get("/ascan/{scan_id}/status")
async def ascan_status(client: ClientDep, scan_id: str) -> dict:
    try:
        return {"scanId": scan_id, "state": str(await client.view("ascan", "status", scanId=scan_id))}
    except ZapError as exc:
        raise _fail(exc) from exc


@router.get("/ascan/{scan_id}/progress")
async def ascan_progress(client: ClientDep, scan_id: str) -> dict:
    try:
        return {"scanId": scan_id, "progress": int(await client.view("ascan", "scanProgress", scanId=scan_id))}
    except ZapError as exc:
        raise _fail(exc) from exc


@router.post("/ascan/{scan_id}/stop")
async def ascan_stop(client: ClientDep, scan_id: str) -> dict:
    await client.action("ascan", "stop", scanId=scan_id)
    return {"status": "ok"}


@router.post("/ascan/{scan_id}/pause")
async def ascan_pause(client: ClientDep, scan_id: str) -> dict:
    await client.action("ascan", "pause", scanId=scan_id)
    return {"status": "ok"}


@router.post("/ascan/{scan_id}/resume")
async def ascan_resume(client: ClientDep, scan_id: str) -> dict:
    await client.action("ascan", "resume", scanId=scan_id)
    return {"status": "ok"}


@router.get("/ascan/scanners")
async def ascan_scanners(client: ClientDep, policy: str | None = None) -> dict:
    return {"scanners": await client.view("ascan", "scanners", scanPolicyName=policy) or []}


class ScannerIds(BaseModel):
    ids: list[str]


@router.post("/ascan/scanners/enable")
async def ascan_enable(client: ClientDep, payload: ScannerIds) -> dict:
    await client.action("ascan", "enableScanners", ids=",".join(payload.ids))
    return {"status": "ok"}


@router.post("/ascan/scanners/disable")
async def ascan_disable(client: ClientDep, payload: ScannerIds) -> dict:
    await client.action("ascan", "disableScanners", ids=",".join(payload.ids))
    return {"status": "ok"}


# -------------------------------------------------------------- passive scan
@router.get("/pscan/scanners")
async def pscan_scanners(client: ClientDep) -> dict:
    return {"scanners": await client.view("pscan", "scanners") or []}


@router.get("/pscan/records")
async def pscan_records(client: ClientDep) -> dict:
    return {"recordsToScan": int(await client.view("pscan", "recordsToScan"))}


class ThresholdRequest(BaseModel):
    id: str
    alertThreshold: str


@router.post("/pscan/scanners/threshold")
async def pscan_threshold(client: ClientDep, payload: ThresholdRequest) -> dict:
    await client.action("pscan", "setScannerAlertThreshold", id=payload.id,
                        alertThreshold=payload.alertThreshold)
    return {"status": "ok"}


@router.post("/pscan/scanners/enable")
async def pscan_enable(client: ClientDep, payload: ScannerIds) -> dict:
    await client.action("pscan", "enableScanners", ids=",".join(payload.ids))
    return {"status": "ok"}


@router.post("/pscan/scanners/disable")
async def pscan_disable(client: ClientDep, payload: ScannerIds) -> dict:
    await client.action("pscan", "disableScanners", ids=",".join(payload.ids))
    return {"status": "ok"}
