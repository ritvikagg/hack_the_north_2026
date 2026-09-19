"""Tiny local HTTP API for the Pocket Gait baseline.

Start with:
    python service/gait_scoring_api.py

POST raw CSV bytes to http://127.0.0.1:8787/score with Content-Type: text/csv.
It deliberately binds only to localhost; put it behind the team's authenticated
backend before exposing it beyond a development machine.
"""

from __future__ import annotations

import json
import sys
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from gait_scoring import DEFAULT_MODEL, score_session  # noqa: E402

MAX_CSV_BYTES = 20 * 1024 * 1024


class GaitScoringHandler(BaseHTTPRequestHandler):
    server_version = "PocketGaitScoring/0.1"

    def send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        self.send_json(HTTPStatus.OK, {"status": "ok", "model": DEFAULT_MODEL.name})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/score":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
            if length <= 0 or length > MAX_CSV_BYTES:
                raise ValueError(f"CSV must be between 1 and {MAX_CSV_BYTES} bytes")
            payload = self.rfile.read(length)
            if len(payload) != length:
                raise ValueError("Incomplete request body")
            with tempfile.NamedTemporaryFile(mode="wb", suffix=".csv", delete=False) as csv_file:
                csv_file.write(payload)
                csv_path = Path(csv_file.name)
            try:
                result = score_session(csv_path)
            finally:
                csv_path.unlink(missing_ok=True)
            self.send_json(HTTPStatus.OK, result)
        except (UnicodeDecodeError, ValueError, KeyError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Unable to score CSV"})

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    if not DEFAULT_MODEL.is_file():
        raise SystemExit(f"Model missing: run scripts/train_gait_baseline.py first ({DEFAULT_MODEL})")
    server = ThreadingHTTPServer(("127.0.0.1", 8787), GaitScoringHandler)
    print("Pocket Gait scoring API listening on http://127.0.0.1:8787")
    print("POST a raw text/csv body to /score; GET /health for readiness.")
    server.serve_forever()


if __name__ == "__main__":
    main()
