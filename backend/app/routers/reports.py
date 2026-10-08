"""Report generation and download."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.deps import ClientDep, SettingsDep
from app.zap_client import ZapError

router = APIRouter(prefix="/api/reports", tags=["reports"])

_TEMPLATE_EXT = {
    "traditional-html": "html", "traditional-html-plus": "html",
    "traditional-md": "md", "traditional-json": "json", "traditional-json-plus": "json",
    "traditional-xml": "xml", "traditional-xml-plus": "xml",
    "traditional-pdf": "pdf", "modern": "html", "high-level-report": "html",
    "risk-confidence-html": "html", "sarif-json": "sarif", "auth-report-json": "json",
}


@router.get("/templates")
async def templates(client: ClientDep) -> dict:
    try:
        names = await client.view("reports", "templates") or []
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return {
        "templates": [
            {"name": name, "extension": _TEMPLATE_EXT.get(name, "html")} for name in names
        ]
    }


class ReportRequest(BaseModel):
    title: str = "ZAP Studio Report"
    template: str = "traditional-html"
    theme: str | None = None
    description: str = ""
    sites: list[str] | None = None
    includedRisks: list[str] | None = None
    includedConfidences: list[str] | None = None


@router.post("/generate")
async def generate(settings: SettingsDep, client: ClientDep, payload: ReportRequest) -> dict:
    reports_dir = settings.home / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    ext = _TEMPLATE_EXT.get(payload.template, "html")
    filename = f"zap-studio-report.{ext}"
    try:
        await client.action(
            "reports", "generate", title=payload.title, template=payload.template,
            theme=payload.theme, description=payload.description or None,
            sites=",".join(payload.sites) if payload.sites else None,
            includedRisks=",".join(payload.includedRisks) if payload.includedRisks else None,
            includedConfidences=",".join(payload.includedConfidences) if payload.includedConfidences else None,
            reportDir=str(reports_dir), reportFileName=filename,
        )
    except ZapError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return {"file": str(reports_dir / filename), "filename": filename}


@router.get("/download")
async def download(settings: SettingsDep, filename: str) -> Response:
    path = (settings.home / "reports" / filename).resolve()
    reports_dir = (settings.home / "reports").resolve()
    if reports_dir not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    media = {
        "html": "text/html", "json": "application/json", "xml": "application/xml",
        "md": "text/markdown", "pdf": "application/pdf", "sarif": "application/json",
    }.get(path.suffix.lstrip("."), "application/octet-stream")
    return Response(content=path.read_bytes(), media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{path.name}"'})
