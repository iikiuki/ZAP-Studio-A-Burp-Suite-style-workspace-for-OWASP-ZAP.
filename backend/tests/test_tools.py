"""Decoder/Comparer tooling tests."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routers.tools import _decode, _encode


def test_base64_roundtrip():
    encoded = _encode("base64", "hello world")
    assert encoded == "aGVsbG8gd29ybGQ="
    assert _decode("base64", encoded) == "hello world"


def test_url_encoding_escapes_reserved_characters():
    assert _encode("url", "a b&c=d") == "a%20b%26c%3Dd"
    assert _decode("url", "a%20b%26c%3Dd") == "a b&c=d"


def test_html_encoding():
    assert _encode("html", "<script>") == "&lt;script&gt;"
    assert _decode("html", "&lt;script&gt;") == "<script>"


def test_hex_encoding():
    assert _encode("hex", "AB") == "4142"
    assert _decode("hex", "4142") == "AB"


def test_hashes_are_stable():
    assert _encode("md5", "abc") == "900150983cd24fb0d6963f7d28e17f72"
    assert _encode("sha256", "abc").startswith("ba7816bf")


def test_ascii_hex_has_spaces():
    assert _encode("ascii-hex", "AB") == "41 42"


def test_gzip_base64_roundtrip():
    encoded = _encode("gzip-base64", "compress me")
    assert _decode("gzip-base64", encoded) == "compress me"


def test_unknown_encoder_raises_422():
    with pytest.raises(HTTPException) as exc:
        _encode("rot13", "x")
    assert exc.value.status_code == 422


def test_non_reversible_encoder_cannot_decode():
    with pytest.raises(HTTPException):
        _decode("sha256", "deadbeef")
