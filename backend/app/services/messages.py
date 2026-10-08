"""HTTP message parsing/formatting used by Repeater and Intruder."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit

REQUEST_LINE_RE = re.compile(r"^([A-Z]+)\s+(\S+)\s+(HTTP/\d(?:\.\d)?)\s*$")


def split_message(raw: str) -> tuple[str, str]:
    """Split a raw HTTP message into (head, body)."""
    raw = raw.replace("\r\n", "\n")
    if "\n\n" in raw:
        head, body = raw.split("\n\n", 1)
        return head, body
    return raw, ""


def parse_head(head: str) -> tuple[str, list[tuple[str, str]]]:
    lines = [ln for ln in head.split("\n") if ln != ""]
    if not lines:
        return "", []
    start = lines[0]
    headers: list[tuple[str, str]] = []
    for line in lines[1:]:
        if ":" in line:
            name, value = line.split(":", 1)
            headers.append((name.strip(), value.strip()))
    return start, headers


def parse_request(raw: str) -> dict[str, Any]:
    head, body = split_message(raw)
    start, headers = parse_head(head)
    match = REQUEST_LINE_RE.match(start)
    method = match.group(1) if match else "GET"
    target = match.group(2) if match else "/"
    version = match.group(3) if match else "HTTP/1.1"
    host = next((v for k, v in headers if k.lower() == "host"), "")
    if target.startswith("http://") or target.startswith("https://"):
        url = target
        path = urlsplit(target).path or "/"
    else:
        scheme = "https" if _is_tls(target) else "http"
        url = f"{scheme}://{host}{target}" if host else target
        path = target
    return {
        "method": method, "target": target, "version": version, "host": host,
        "url": url, "path": path, "headers": [{"name": k, "value": v} for k, v in headers],
        "body": body,
    }


def _is_tls(target: str) -> bool:
    return target.lower().startswith("https:")


def build_request(method: str, url: str, headers: list[dict[str, str]] | dict[str, str],
                  body: str = "") -> str:
    """Assemble a raw HTTP request suitable for ZAP's ``sendRequest``."""
    parts = urlsplit(url)
    header_items: list[tuple[str, str]]
    if isinstance(headers, dict):
        header_items = list(headers.items())
    else:
        header_items = [(h["name"], h["value"]) for h in headers]

    names = {k.lower() for k, _ in header_items}
    if "host" not in names and parts.netloc:
        header_items.insert(0, ("Host", parts.netloc))

    request_target = url if parts.scheme else (parts.path or "/")
    lines = [f"{method.upper()} {request_target} HTTP/1.1"]
    lines += [f"{k}: {v}" for k, v in header_items if v is not None]
    raw = "\r\n".join(lines) + "\r\n\r\n" + (body or "")
    return raw


def parse_response(raw: str) -> dict[str, Any]:
    head, body = split_message(raw)
    start, headers = parse_head(head)
    status_match = re.match(r"HTTP/\d(?:\.\d)?\s+(\d{3})\s*(.*)", start)
    return {
        "statusLine": start,
        "status": int(status_match.group(1)) if status_match else 0,
        "reason": status_match.group(2).strip() if status_match else "",
        "headers": [{"name": k, "value": v} for k, v in headers],
        "body": body,
        "length": len(body.encode("utf-8", "ignore")),
    }


def count_placeholders(payload: str) -> int:
    return len(re.findall(r"§[^§]*§", payload))
