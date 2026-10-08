"""Intruder payload generation — attack types must mirror Burp Suite semantics."""
from __future__ import annotations

import pytest

from app.services.intruder import (IntruderConfig, generate_requests,
                                   placeholders, substitute_request)

REQ = "GET http://x/?a=§1§&b=§2§ HTTP/1.1\r\nHost: x\r\n\r\n"


def cfg(attack: str, sets: list[list[str]]) -> IntruderConfig:
    return IntruderConfig(request=REQ, attack_type=attack, payload_sets=sets)


def test_placeholders_detected_in_order():
    assert placeholders(REQ) == ["1", "2"]
    assert placeholders("no markers") == []


def test_sniper_attacks_one_position_at_a_time():
    requests = generate_requests(cfg("sniper", [["A", "B"]]))
    # 2 positions x 2 payloads
    assert len(requests) == 4
    rendered = [r for _p, r in requests]
    assert "a=A&b=2" in rendered[0]
    assert "a=1&b=A" in rendered[2]


def test_batteringram_uses_same_payload_everywhere():
    requests = generate_requests(cfg("batteringram", [["A", "B"]]))
    assert len(requests) == 2
    assert "a=A&b=A" in requests[0][1]
    assert "a=B&b=B" in requests[1][1]


def test_pitchfork_advances_in_lockstep():
    requests = generate_requests(cfg("pitchfork", [["A", "B", "C"], ["1", "2"]]))
    # zip stops at the shorter set
    assert len(requests) == 2
    assert "a=A&b=1" in requests[0][1]
    assert "a=B&b=2" in requests[1][1]


def test_clusterbomb_is_cartesian_product():
    requests = generate_requests(cfg("clusterbomb", [["A", "B"], ["1", "2"]]))
    assert len(requests) == 4
    rendered = [r for _p, r in requests]
    assert any("a=A&b=1" in r for r in rendered)
    assert any("a=B&b=2" in r for r in rendered)


def test_no_markers_yields_single_request():
    request = IntruderConfig(request="GET / HTTP/1.1\r\n\r\n", attack_type="sniper")
    requests = generate_requests(request)
    assert len(requests) == 1
    assert requests[0][1] == "GET / HTTP/1.1\r\n\r\n"


def test_unknown_attack_type_raises():
    with pytest.raises(ValueError):
        generate_requests(cfg("sniperish", [["A"]]))


def test_substitute_request_replaces_markers():
    assert substitute_request("a=§x§&b=§y§", ["1", "2"]) == "a=1&b=2"
