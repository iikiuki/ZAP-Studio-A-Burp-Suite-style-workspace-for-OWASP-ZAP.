"""Intruder: create an attack, stream results, cancel."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.deps import IntruderRunsDep
from app.services.intruder import IntruderConfig, generate_requests

router = APIRouter(prefix="/api/intruder", tags=["intruder"])


class IntruderRequest(BaseModel):
    request: str
    attackType: str = "sniper"
    payloadSets: list[list[str]] = []
    threads: int = 10
    delayMs: int = 0
    followRedirects: bool = False


@router.post("/preview")
async def preview(payload: IntruderRequest) -> dict:
    cfg = IntruderConfig(
        request=payload.request, attack_type=payload.attackType,
        payload_sets=payload.payloadSets, threads=payload.threads,
        delay_ms=payload.delayMs, follow_redirects=payload.followRedirects,
    )
    requests = generate_requests(cfg)
    return {"total": len(requests), "sample": [r for _p, r in requests[:5]]}


@router.post("/runs")
async def create_run(runs: IntruderRunsDep, payload: IntruderRequest) -> dict:
    cfg = IntruderConfig(
        request=payload.request, attack_type=payload.attackType,
        payload_sets=payload.payloadSets, threads=payload.threads,
        delay_ms=payload.delayMs, follow_redirects=payload.followRedirects,
    )
    if not generate_requests(cfg):
        raise HTTPException(status_code=422, detail="No requests generated. Add §markers§.")
    managed = runs.create(cfg)
    await managed.start()
    return {"runId": managed.id, "total": managed.run.total}


@router.get("/runs/{run_id}/stream")
async def stream(runs: IntruderRunsDep, run_id: str) -> StreamingResponse:
    managed = runs.get(run_id)
    if managed is None:
        raise HTTPException(status_code=404, detail="Unknown run")
    queue = managed.add_consumer()

    async def event_source():
        try:
            while True:
                item = await queue.get()
                if item is None:
                    yield f"event: done\ndata: {json.dumps({'total': len(managed.results)})}\n\n"
                    break
                yield f"data: {json.dumps(item.as_dict())}\n\n"
        finally:
            managed.remove_consumer(queue)

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.get("/runs/{run_id}")
async def get_run(runs: IntruderRunsDep, run_id: str) -> dict:
    managed = runs.get(run_id)
    if managed is None:
        raise HTTPException(status_code=404, detail="Unknown run")
    return {
        "runId": run_id,
        "finished": managed.finished.is_set(),
        "total": managed.run.total,
        "results": [r.as_dict() for r in managed.results],
    }


@router.post("/runs/{run_id}/cancel")
async def cancel_run(runs: IntruderRunsDep, run_id: str) -> dict:
    managed = runs.get(run_id)
    if managed is None:
        raise HTTPException(status_code=404, detail="Unknown run")
    managed.cancel()
    return {"status": "cancelled"}
