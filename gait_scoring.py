"""Shared inference helpers for the Pocket Gait prototype baseline."""

from __future__ import annotations

import json
import csv
import math
from pathlib import Path

import numpy as np

from scripts.train_gait_baseline import session_features


ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "models" / "gait_baseline.json"


def validate_recording(csv_path: Path) -> None:
    """Reject missing time/sensor fields instead of returning NaN model scores."""
    required = ("t_ns", "accel_x_mps2", "accel_y_mps2", "accel_z_mps2", "gyro_x_rads", "gyro_y_rads", "gyro_z_rads")
    first = previous = None
    count = accel_count = gyro_count = 0
    with csv_path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or not set(required).issubset(reader.fieldnames):
            raise ValueError("CSV needs t_ns plus acceleration and gyroscope columns")
        for row in reader:
            try:
                time = float(row['t_ns'])
                # The native collector leaves startup gyro fields blank until
                # that sensor emits its first value. Preserve that format.
                sensors = [float(row[key]) if row[key] not in ('', None) else None for key in required[1:]]
            except (ValueError, TypeError, KeyError) as error:
                raise ValueError("Recording contains missing or invalid sensor values") from error
            if not math.isfinite(time) or not all(value is None or math.isfinite(value) for value in sensors):
                raise ValueError("Recording contains non-finite sensor values")
            accel_count += all(value is not None for value in sensors[:3])
            gyro_count += all(value is not None for value in sensors[3:])
            if previous is not None and time < previous:
                raise ValueError("Recording timestamps must be ordered")
            first = time if first is None else first
            previous = time
            count += 1
            if count > 200_000:
                raise ValueError("Recording contains too many samples")
    duration = (previous - first) / 1_000_000_000 if first is not None and previous is not None else 0
    if min(count, accel_count, gyro_count) < 150 or duration < 8 or duration > 1200:
        raise ValueError("Record between 8 seconds and 20 minutes of motion with at least 150 samples")


def score_session(csv_path: Path, model_path: Path = DEFAULT_MODEL) -> dict[str, object]:
    """Return a deterministic model score for one recorded walking session."""
    validate_recording(csv_path)
    model = json.loads(model_path.read_text(encoding="utf-8"))
    feature_names, values = session_features(csv_path)
    expected = model["feature_names"]
    if feature_names != expected:
        raise ValueError("CSV feature schema does not match the selected model")
    x = np.asarray(values, dtype=float)
    if not np.all(np.isfinite(x)):
        raise ValueError("Recording could not produce finite gait features")
    mean = np.asarray(model["mean"], dtype=float)
    scale = np.asarray(model["scale"], dtype=float)
    weights = np.asarray(model["weights"], dtype=float)
    score = float(np.clip(((x - mean) / scale) @ weights + float(model["bias"]), -30, 30))
    probability = float(1 / (1 + np.exp(-score)))
    return {
        "model_type": model["model_type"],
        "positive_class": model["positive_class"],
        "genuine_probability": probability,
        "decision": "genuine" if probability >= 0.5 else "altered_gait",
        "feature_values": dict(zip(feature_names, values, strict=True)),
        "limitations": model["limitations"],
    }
