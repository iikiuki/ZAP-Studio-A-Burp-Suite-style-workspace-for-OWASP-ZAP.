"""Stateless tooling: Decoder (encode/decode) and Comparer (diff)."""
from __future__ import annotations

import base64
import binascii
import difflib
import gzip
import hashlib
import html
import json
import urllib.parse
import zlib

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/tools", tags=["tools"])

ENCODERS = [
    "base64", "base64url", "url", "html", "hex", "ascii-hex", "gzip-base64",
    "md5", "sha1", "sha256",
]


def _encode(kind: str, data: str) -> str:
    raw = data.encode("utf-8")
    if kind == "base64":
        return base64.b64encode(raw).decode()
    if kind == "base64url":
        return base64.urlsafe_b64encode(raw).decode()
    if kind == "url":
        return urllib.parse.quote(data, safe="")
    if kind == "html":
        return html.escape(data)
    if kind == "hex":
        return binascii.hexlify(raw).decode()
    if kind == "ascii-hex":
        return " ".join(f"{b:02x}" for b in raw)
    if kind == "gzip-base64":
        return base64.b64encode(gzip.compress(raw)).decode()
    if kind == "md5":
        return hashlib.md5(raw).hexdigest()
    if kind == "sha1":
        return hashlib.sha1(raw).hexdigest()
    if kind == "sha256":
        return hashlib.sha256(raw).hexdigest()
    raise HTTPException(status_code=422, detail=f"Unknown encoder: {kind}")


def _decode(kind: str, data: str) -> str:
    if kind == "base64":
        return base64.b64decode(data, validate=False).decode("utf-8", "replace")
    if kind == "base64url":
        return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "replace")
    if kind == "url":
        return urllib.parse.unquote_plus(data)
    if kind == "html":
        return html.unescape(data)
    if kind == "hex":
        return bytes.fromhex(data.replace(" ", "")).decode("utf-8", "replace")
    if kind == "ascii-hex":
        return bytes.fromhex(data.replace(" ", "")).decode("utf-8", "replace")
    if kind == "gzip-base64":
        return gzip.decompress(base64.b64decode(data)).decode("utf-8", "replace")
    raise HTTPException(status_code=422, detail=f"'{kind}' is not reversible")


class TransformRequest(BaseModel):
    input: str
    transformations: list[dict[str, str]]  # [{"kind": "base64", "direction": "encode"}]


@router.get("/encoders")
async def encoders() -> dict:
    return {"encoders": ENCODERS}


@router.post("/transform")
async def transform(payload: TransformRequest) -> dict:
    value = payload.input
    steps: list[dict[str, str]] = []
    for step in payload.transformations:
        kind = step.get("kind", "")
        direction = step.get("direction", "encode")
        try:
            value = _encode(kind, value) if direction == "encode" else _decode(kind, value)
        except (binascii.Error, UnicodeDecodeError, zlib.error, ValueError) as exc:
            raise HTTPException(status_code=422,
                                detail=f"{direction} {kind} failed: {exc}") from exc
        steps.append({"kind": kind, "direction": direction, "output": value})
    return {"output": value, "steps": steps}


class DiffRequest(BaseModel):
    left: str
    right: str
    mode: str = "line"  # line | word | char


@router.post("/diff")
async def diff(payload: DiffRequest) -> dict:
    if payload.mode == "word":
        left = payload.left.split()
        right = payload.right.split()
    elif payload.mode == "char":
        left = list(payload.left)
        right = list(payload.right)
    else:
        left = payload.left.splitlines()
        right = payload.right.splitlines()

    matcher = difflib.SequenceMatcher(a=left, b=right, autojunk=False)
    operations = []
    added = removed = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        removed += i2 - i1
        added += j2 - j1
        operations.append({
            "tag": tag,
            "left": " ".join(left[i1:i2]) if payload.mode != "line" else "\n".join(left[i1:i2]),
            "right": " ".join(right[j1:j2]) if payload.mode != "line" else "\n".join(right[j1:j2]),
        })
    return {
        "operations": operations,
        "added": added,
        "removed": removed,
        "similarity": round(matcher.ratio(), 4),
    }


class JsonFormatRequest(BaseModel):
    input: str
    indent: int = 2


@router.post("/json/format")
async def json_format(payload: JsonFormatRequest) -> dict:
    try:
        parsed = json.loads(payload.input)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {exc}") from exc
    return {"output": json.dumps(parsed, indent=payload.indent)}
