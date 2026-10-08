#!/usr/bin/env python3
"""A deliberately vulnerable demo target for exercising ZAP Studio.

Serves a tiny site on 127.0.0.1:3000 with missing security headers, reflected
input, and an obviously guessable admin path so passive/active scans have
something to report. Never expose this to a network you do not own.
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

INDEX = """<!doctype html><html><head><title>ZAP Studio Demo</title></head>
<body><h1>Demo App</h1>
<ul>
  <li><a href="/search?q=test">Search</a></li>
  <li><a href="/login">Login</a></li>
  <li><a href="/api/data">API data</a></li>
</ul>
<form action="/login" method="post">
  <input name="username" placeholder="username">
  <input name="password" type="password" placeholder="password">
  <button>Sign in</button>
</form>
</body></html>"""

LOGIN = """<!doctype html><html><head><title>Sign in</title></head>
<body><h1>Sign in</h1><form method="post" action="/login">
<input name="username"><input name="password" type="password">
<button>Go</button></form></body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "DemoServer/1.0"

    def _send(self, code: int, body: str, ctype: str = "text/html") -> None:
        payload = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/":
            self._send(200, INDEX)
        elif parsed.path == "/login":
            self._send(200, LOGIN)
        elif parsed.path == "/search":
            term = query.get("q", [""])[0]
            # Reflected without escaping — a textbook XSS sink for scanners.
            self._send(200, f"<html><body>Results for {term}</body></html>")
        elif parsed.path == "/api/data":
            self._send(200, json.dumps({"users": [{"id": 1, "name": "ada",
                                                   "token": "s3cr3t-token"}]}),
                       "application/json")
        elif parsed.path == "/admin":
            self._send(403, "<html><body>Forbidden</body></html>")
        else:
            self._send(404, "<html><body>Not found</body></html>")

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode(errors="replace")
        self._send(200, f"<html><body>Received: {body}</body></html>")

    def log_message(self, *args) -> None:  # keep the console quiet
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="ZAP Studio demo target")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3000)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Demo target listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
