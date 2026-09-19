"""Score a collected gait CSV with the current prototype model.

Usage:
    python scripts/score_gait_session.py data/raw/gait_sessions/example.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from gait_scoring import DEFAULT_MODEL, score_session  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Score a Pocket Gait CSV session.")
    parser.add_argument("csv", type=Path, help="CSV created by Pocket Gait Collector")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL, help="Model JSON to use")
    args = parser.parse_args()
    if not args.csv.is_file():
        parser.error(f"CSV does not exist: {args.csv}")
    if not args.model.is_file():
        parser.error(f"Model does not exist: {args.model}")
    print(json.dumps(score_session(args.csv, args.model), indent=2))


if __name__ == "__main__":
    main()
