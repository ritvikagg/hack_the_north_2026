"""Shared inference helpers for the Pocket Gait prototype baseline."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from scripts.train_gait_baseline import session_features


ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "models" / "gait_baseline.json"


def score_session(csv_path: Path, model_path: Path = DEFAULT_MODEL) -> dict[str, object]:
    """Return a deterministic model score for one recorded walking session."""
    model = json.loads(model_path.read_text(encoding="utf-8"))
    feature_names, values = session_features(csv_path)
    expected = model["feature_names"]
    if feature_names != expected:
        raise ValueError("CSV feature schema does not match the selected model")
    x = np.asarray(values, dtype=float)
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
