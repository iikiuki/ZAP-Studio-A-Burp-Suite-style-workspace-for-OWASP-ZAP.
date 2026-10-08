"""HTTP message parsing/formatting tests — pure logic, no ZAP required."""
from __future__ import annotations

from app.services.messages import (build_request, count_placeholders,
                                   parse_request, parse_response, split_message)

REQUEST = (
    "GET http://example.com/search?q=test HTTP/1.1\r\n"
    "Host: example.com\r\n"
    "User-Agent: pytest\r\n"
    "Accept: */*\r\n"
    "\r\n"
)

RESPONSE = (
    "HTTP/1.1 404 Not Found\r\n"
    "Content-Type: text/html; charset=utf-8\r\n"
    "Content-Length: 11\r\n"
    "\r\n"
    "hello world"
)


def test_split_message_separates_head_and_body():
    head, body = split_message(REQUEST)
    assert head.startswith("GET http://example.com")
    assert body == ""


def test_split_message_with_body():
    head, body = split_message("POST /x HTTP/1.1\nHost: h\n\nabc=1")
    assert "Host: h" in head
    assert body == "abc=1"


def test_parse_request_absolute_uri():
    parsed = parse_request(REQUEST)
    assert parsed["method"] == "GET"
    assert parsed["host"] == "example.com"
    assert parsed["url"] == "http://example.com/search?q=test"
    assert parsed["path"] == "/search"
    assert {"name": "User-Agent", "value": "pytest"} in parsed["headers"]


def test_parse_request_origin_form_builds_url_from_host():
    raw = "GET /admin HTTP/1.1\r\nHost: target.local:8443\r\n\r\n"
    parsed = parse_request(raw)
    assert parsed["url"] == "http://target.local:8443/admin"
    assert parsed["method"] == "GET"


def test_parse_response_status_and_length():
    parsed = parse_response(RESPONSE)
    assert parsed["status"] == 404
    assert parsed["reason"] == "Not Found"
    assert parsed["length"] == len("hello world")
    assert {"name": "Content-Type", "value": "text/html; charset=utf-8"} in parsed["headers"]


def test_build_request_adds_host_header_and_crlf():
    raw = build_request("GET", "http://example.com/a", {"Accept": "*/*"})
    assert raw.startswith("GET http://example.com/a HTTP/1.1\r\n")
    assert "Host: example.com\r\n" in raw
    assert raw.endswith("\r\n\r\n")


def test_build_request_keeps_explicit_host():
    raw = build_request("GET", "http://example.com/a", [{"name": "Host", "value": "other.test"}])
    assert "Host: other.test" in raw
    assert "Host: example.com" not in raw


def test_build_request_appends_body():
    raw = build_request("POST", "http://example.com/login", {}, "u=a&p=b")
    assert raw.endswith("\r\n\r\nu=a&p=b")


def test_count_placeholders():
    assert count_placeholders("GET /?q=§a§&r=§b§ HTTP/1.1") == 2
    assert count_placeholders("GET / HTTP/1.1") == 0
