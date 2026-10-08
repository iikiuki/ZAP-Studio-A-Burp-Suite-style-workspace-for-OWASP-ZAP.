"""API-level tests using an in-process fake ZAP daemon.

These exercise the real FastAPI routes (dependency injection, serialization,
error mapping) without requiring a live OWASP ZAP install.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.deps import (get_bus, get_client, get_intruder_runs, get_manager,
                      get_settings)
from app.routers import (alerts, intruder, proxy, repeater, reports, scans,
                         system, targets, tools)
from app.services.events import EventBus
from app.services.intruder_runs import IntruderRunManager
from app.zap_client import ZapClient

MESSAGE = {
    "id": "7",
    "timestamp": "1700000000000",
    "rtt": "12",
    "requestHeader": "GET http://demo.test/api HTTP/1.1\r\nHost: demo.test\r\n\r\n",
    "requestBody": "",
    "responseHeader": "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n",
    "responseBody": '{"ok":true}',
    "note": "",
    "tags": [],
}

ALERT = {
    "id": "1", "alert": "SQL Injection", "risk": "High", "confidence": "High",
    "url": "http://demo.test/api?id=1", "param": "id", "attack": "' OR 1=1",
    "evidence": "SQL syntax", "description": "desc", "solution": "fix",
    "reference": "https://owasp.org", "cweid": "89", "wascid": "19",
    "sourceid": "3", "alertRef": "40018", "pluginId": "40018", "messageId": "7",
    "method": "GET", "tags": {"POLICY_PENTEST": ""},
}


class FakeZap:
    """Minimal stand-in for the ZAP JSON API."""

    def __init__(self):
        self.requests: list[tuple[str, str, str, dict]] = []
        self.new_session_calls = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        parts = [p for p in request.url.path.strip("/").split("/") if p]
        # /JSON/{component}/{kind}/{name}
        component, kind, name = parts[1], parts[2], parts[3]
        params = dict(request.url.params)
        self.requests.append((component, kind, name, params))

        if (component, kind, name) == ("core", "view", "version"):
            return httpx.Response(200, json={"version": "2.17.0"})
        if (component, kind, name) == ("core", "view", "numberOfMessages"):
            return httpx.Response(200, json={"numberOfMessages": "17"})
        if (component, kind, name) == ("core", "view", "numberOfAlerts"):
            return httpx.Response(200, json={"numberOfAlerts": "29"})
        if (component, kind, name) == ("core", "view", "messages"):
            return httpx.Response(200, json={"messages": [MESSAGE]})
        if (component, kind, name) == ("core", "view", "message"):
            return httpx.Response(200, json=MESSAGE)
        if (component, kind, name) == ("core", "view", "sites"):
            return httpx.Response(200, json={"sites": ["http://demo.test"]})
        if (component, kind, name) == ("core", "view", "urls"):
            return httpx.Response(200, json={"urls": ["http://demo.test/api"]})
        if (component, kind, name) == ("alert", "view", "alerts"):
            return httpx.Response(200, json={"alerts": [ALERT]})
        if (component, kind, name) == ("alert", "view", "alertsSummary"):
            return httpx.Response(200, json={"High": 1, "Medium": 0, "Low": 0, "Informational": 0})
        if (component, kind, name) == ("alert", "view", "alertCountsByRisk"):
            return httpx.Response(200, json={"High": 1})
        if (component, kind, name) == ("spider", "view", "scans"):
            return httpx.Response(200, json={"scans": [{"id": "0", "state": "FINISHED", "progress": "100"}]})
        if (component, kind, name) == ("ascan", "view", "scans"):
            return httpx.Response(200, json={"scans": []})
        if (component, kind, name) == ("pscan", "view", "recordsToScan"):
            return httpx.Response(200, json={"recordsToScan": "0"})
        if (component, kind, name) == ("reports", "view", "templates"):
            return httpx.Response(200, json={"templates": ["traditional-html", "traditional-json"]})
        if (component, kind, name) == ("network", "view", "getLocalServers"):
            return httpx.Response(200, json={"localServers": [
                {"address": "localhost", "port": "8080", "proxy": True, "enabled": True, "api": False},
            ]})
        if (component, kind, name) == ("break", "view", "isBreakAll"):
            return httpx.Response(200, json={"isBreakAll": "false"})
        if kind == "action" and (component, name) == ("core", "sendRequest"):
            return httpx.Response(200, json={
                "requestHeader": "GET http://demo.test/api HTTP/1.1\r\nhost: demo.test\r\n\r\n",
                "requestBody": "",
                "responseHeader": "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n",
                "responseBody": '{"ok":true}',
                "rtt": "9",
            })
        if (component, name) == ("core", "newSession"):
            self.new_session_calls += 1
            return httpx.Response(200, json={})
        if (component, name) == ("spider", "scan"):
            return httpx.Response(200, json={"scan": "3"})
        if (component, name) == ("ascan", "scan"):
            return httpx.Response(200, json={"scan": "4"})
        return httpx.Response(200, json={})


@pytest.fixture
def fake() -> FakeZap:
    return FakeZap()


@pytest.fixture
def client(fake: FakeZap, tmp_path) -> TestClient:
    settings = Settings(home=tmp_path, zap_key="testkey", autostart_zap=False,
                        request_timeout=5.0)
    settings.home.mkdir(parents=True, exist_ok=True)
    zap = ZapClient(settings)
    zap._client = httpx.AsyncClient(base_url=settings.api_url, transport=httpx.MockTransport(fake.handler))

    app = FastAPI()
    for module in (system, targets, proxy, scans, alerts, repeater, intruder, reports, tools):
        app.include_router(module.router)

    manager = _StubManager(settings, zap)
    bus = EventBus()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_client] = lambda: zap
    app.dependency_overrides[get_manager] = lambda: manager
    app.dependency_overrides[get_bus] = lambda: bus
    runs = IntruderRunManager(zap)
    app.dependency_overrides[get_intruder_runs] = lambda: runs
    app.state.settings = settings
    app.state.zap_client = zap
    app.state.bus = bus
    app.state.intruder_runs = runs

    with TestClient(app) as test_client:
        yield test_client


class _StubManager:
    """Manager stub that never spawns a process."""

    def __init__(self, settings, client):
        self._settings = settings
        self._client = client
        self._path = "/opt/zaproxy/zap.sh"

    managed = False
    external = True
    zap_path = "/opt/zaproxy/zap.sh"

    def is_running(self) -> bool:
        return True

    async def version(self):
        return "2.17.0"

    async def ensure_proxy(self):
        return {"address": "localhost", "port": "8080", "proxy": True}

    async def start(self):
        return "already-running"

    async def stop(self):
        return None


# --------------------------------------------------------------------- tests
def test_health_and_status(client: TestClient):
    status = client.get("/api/system/status").json()
    assert status["running"] is True
    assert status["version"] == "2.17.0"
    assert status["proxy"]["port"] == "8080"


def test_proxy_history_is_parsed(client: TestClient):
    items = client.get("/api/proxy/history?count=10").json()
    assert len(items) == 1
    item = items[0]
    assert item["method"] == "GET"
    assert item["url"] == "http://demo.test/api"
    assert item["status"] == 200
    assert item["mimeType"] == "application/json"
    assert item["rtt"] == 12


def test_proxy_message_detail(client: TestClient):
    detail = client.get("/api/proxy/message/7").json()
    assert detail["request"]["host"] == "demo.test"
    assert detail["response"]["status"] == 200
    assert '"ok":true' in detail["responseRaw"]


def test_repeater_send_returns_full_exchange(client: TestClient):
    result = client.post("/api/repeater/send", json={
        "raw": "GET http://demo.test/api HTTP/1.1\r\nHost: demo.test\r\n\r\n",
    }).json()
    assert result["response"]["status"] == 200
    assert result["rtt"] == 9
    assert result["request"]["method"] == "GET"


def test_repeater_send_requires_raw_or_url(client: TestClient):
    assert client.post("/api/repeater/send", json={}).status_code == 422


def test_alerts_are_normalized(client: TestClient):
    alert = client.get("/api/alerts").json()[0]
    assert alert["name"] == "SQL Injection"
    assert alert["risk"] == "High"
    assert alert["cweId"] == "89"
    assert alert["tags"]["POLICY_PENTEST"] == ""


def test_alert_counts_and_summary(client: TestClient):
    assert client.get("/api/alerts/count").json()["count"] == 29
    assert client.get("/api/alerts/counts").json()["High"] == 1


def test_site_map(client: TestClient):
    assert client.get("/api/target/sites").json()["sites"] == ["http://demo.test"]
    assert client.get("/api/target/urls?baseurl=http://demo.test").json()["urls"] == [
        "http://demo.test/api",
    ]


def test_spider_and_active_scan_start(client: TestClient):
    spider = client.post("/api/scans/spider", json={"url": "http://demo.test", "recurse": True})
    assert spider.status_code == 200 and spider.json()["scanId"] == "3"
    active = client.post("/api/scans/ascan", json={"url": "http://demo.test"})
    assert active.status_code == 200 and active.json()["scanId"] == "4"
    assert client.get("/api/scans/spider").json()["scans"][0]["state"] == "FINISHED"


def test_reports_templates(client: TestClient):
    names = [t["name"] for t in client.get("/api/reports/templates").json()["templates"]]
    assert "traditional-html" in names


def test_report_generation_returns_download_path(client: TestClient):
    res = client.post("/api/reports/generate",
                      json={"title": "T", "template": "traditional-json"}).json()
    assert res["filename"] == "zap-studio-report.json"
    assert res["file"].endswith("reports/zap-studio-report.json")


def test_decoder_transform_chain(client: TestClient):
    res = client.post("/api/tools/transform", json={
        "input": "hi",
        "transformations": [{"kind": "base64", "direction": "encode"}],
    }).json()
    assert res["output"] == "aGk="


def test_comparer_diff(client: TestClient):
    res = client.post("/api/tools/diff", json={"left": "a\nb", "right": "a\nc", "mode": "line"}).json()
    assert res["added"] == 1 and res["removed"] == 1


def test_intruder_preview_counts_requests(client: TestClient):
    res = client.post("/api/intruder/preview", json={
        "request": "GET /?q=§p§ HTTP/1.1\r\nHost: x\r\n\r\n",
        "attackType": "sniper",
        "payloadSets": [["a", "b", "c"]],
    }).json()
    assert res["total"] == 3


def test_intruder_run_executes_and_records_results(client: TestClient):
    created = client.post("/api/intruder/runs", json={
        "request": "GET http://demo.test/?q=§p§ HTTP/1.1\r\nHost: demo.test\r\n\r\n",
        "attackType": "sniper",
        "payloadSets": [["a", "b"]],
        "threads": 2,
    }).json()
    run_id = created["runId"]
    assert created["total"] == 2
    run = client.get(f"/api/intruder/runs/{run_id}").json()
    assert run["total"] == 2
    assert len(run["results"]) == 2
    assert all(r["status"] == 200 for r in run["results"])


def test_intruder_unknown_run_404(client: TestClient):
    assert client.get("/api/intruder/runs/nope").status_code == 404


def test_clear_history_starts_new_session(client: TestClient, fake: FakeZap):
    client.post("/api/proxy/history/clear")
    assert fake.new_session_calls == 1
