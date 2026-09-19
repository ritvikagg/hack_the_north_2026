"""Train a small, reproducible gait-session baseline from collected CSV files.

This is deliberately a session-level model: a walking attempt is represented by
orientation-invariant accelerometer and gyroscope features.  It is suitable for
the hackathon demo only, not for medical or biometric-identification use.

Usage:
    python scripts/train_gait_baseline.py
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Iterable

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RAW_DATA = ROOT / "data" / "raw" / "gait_sessions"
FEATURES_OUT = ROOT / "data" / "processed" / "session_features.csv"
MODEL_OUT = ROOT / "models" / "gait_baseline.json"
REPORT_OUT = ROOT / "reports" / "gait_baseline_report.md"


def number(row: dict[str, str], key: str) -> float:
    """Read a finite sensor value; empty optional sensor fields become NaN."""
    try:
        value = float(row[key])
        return value if math.isfinite(value) else math.nan
    except (KeyError, TypeError, ValueError):
        return math.nan


def describe(values: np.ndarray, prefix: str) -> tuple[list[str], list[float]]:
    values = values[np.isfinite(values)]
    if not len(values):
        return [f"{prefix}_{name}" for name in ("mean", "std", "p10", "p90", "rms")], [0.0] * 5
    return (
        [f"{prefix}_{name}" for name in ("mean", "std", "p10", "p90", "rms")],
        [
            float(np.mean(values)),
            float(np.std(values)),
            float(np.percentile(values, 10)),
            float(np.percentile(values, 90)),
            float(np.sqrt(np.mean(values**2))),
        ],
    )


def cadence_features(t: np.ndarray, accel_magnitude: np.ndarray) -> tuple[float, float, float]:
    """Estimate step cadence in the 0.7-3 Hz walking band using a uniform signal."""
    good = np.isfinite(t) & np.isfinite(accel_magnitude)
    t, accel_magnitude = t[good], accel_magnitude[good]
    if len(t) < 32 or t[-1] <= t[0]:
        return 0.0, 0.0, 0.0
    # 50 Hz is enough for walking dynamics and avoids over-weighting a fast device.
    grid = np.arange(t[0], t[-1], 1 / 50.0)
    if len(grid) < 32:
        return 0.0, 0.0, 0.0
    signal = np.interp(grid, t, accel_magnitude)
    # Remove slow gravity/pocket-drift content with a one-second moving average.
    window = 51
    baseline = np.convolve(signal, np.ones(window) / window, mode="same")
    signal = (signal - baseline) * np.hanning(len(signal))
    frequencies = np.fft.rfftfreq(len(signal), d=1 / 50.0)
    power = np.abs(np.fft.rfft(signal)) ** 2
    band = (frequencies >= 0.7) & (frequencies <= 3.0)
    if not np.any(band) or not np.any(power[band]):
        return 0.0, 0.0, 0.0
    band_frequencies, band_power = frequencies[band], power[band]
    peak = int(np.argmax(band_power))
    periodicity = float(band_power[peak] / (np.sum(power) + 1e-12))
    normalized = band_power / (np.sum(band_power) + 1e-12)
    entropy = float(-np.sum(normalized * np.log(normalized + 1e-12)) / np.log(len(normalized)))
    return float(band_frequencies[peak] * 60.0), periodicity, entropy


def session_features(path: Path) -> tuple[list[str], list[float]]:
    timestamps: list[float] = []
    accel: list[float] = []
    gyro: list[float] = []
    with path.open(newline="", encoding="utf-8") as csv_file:
        for row in csv.DictReader(csv_file):
            ax, ay, az = (number(row, key) for key in ("accel_x_mps2", "accel_y_mps2", "accel_z_mps2"))
            gx, gy, gz = (number(row, key) for key in ("gyro_x_rads", "gyro_y_rads", "gyro_z_rads"))
            timestamps.append(number(row, "t_ns") / 1_000_000_000)
            accel.append(math.sqrt(ax * ax + ay * ay + az * az))
            gyro.append(math.sqrt(gx * gx + gy * gy + gz * gz))
    t = np.asarray(timestamps, dtype=float)
    a = np.asarray(accel, dtype=float)
    g = np.asarray(gyro, dtype=float)
    duration = float(t[-1] - t[0]) if len(t) > 1 else 0.0
    sample_rate = float((len(t) - 1) / duration) if duration > 0 else 0.0
    cadence_bpm, periodicity, entropy = cadence_features(t, a)
    names_a, values_a = describe(a, "accel_mag")
    names_g, values_g = describe(g, "gyro_mag")
    names = ["duration_s", "sample_rate_hz", "cadence_bpm", "periodicity", "spectral_entropy", *names_a, *names_g]
    values = [duration, sample_rate, cadence_bpm, periodicity, entropy, *values_a, *values_g]
    return names, values


def fit_logistic(x: np.ndarray, y: np.ndarray, epochs: int = 5000, learning_rate: float = 0.03, l2: float = 0.05) -> tuple[np.ndarray, float, np.ndarray, np.ndarray]:
    """A dependency-light L2 logistic regression implementation."""
    mean = x.mean(axis=0)
    scale = x.std(axis=0)
    scale[scale < 1e-8] = 1.0
    z = (x - mean) / scale
    weights = np.zeros(z.shape[1])
    bias = 0.0
    for _ in range(epochs):
        scores = np.clip(z @ weights + bias, -30, 30)
        probability = 1 / (1 + np.exp(-scores))
        residual = probability - y
        weights -= learning_rate * ((z.T @ residual) / len(z) + l2 * weights)
        bias -= learning_rate * float(np.mean(residual))
    return weights, float(bias), mean, scale


def probabilities(x: np.ndarray, weights: np.ndarray, bias: float, mean: np.ndarray, scale: np.ndarray) -> np.ndarray:
    scores = np.clip(((x - mean) / scale) @ weights + bias, -30, 30)
    return 1 / (1 + np.exp(-scores))


def leave_one_out(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    predicted = np.zeros(len(y))
    for holdout in range(len(y)):
        keep = np.arange(len(y)) != holdout
        weights, bias, mean, scale = fit_logistic(x[keep], y[keep])
        predicted[holdout] = probabilities(x[holdout : holdout + 1], weights, bias, mean, scale)[0]
    return predicted


def write_csv(names: list[str], records: Iterable[dict[str, object]]) -> None:
    FEATURES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with FEATURES_OUT.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=["file", "collection_label", "target", "loo_genuine_probability", "loo_prediction", *names],
        )
        writer.writeheader()
        writer.writerows(records)


def main() -> None:
    files = sorted(RAW_DATA.glob("*.csv"))
    if not files:
        raise SystemExit(f"No CSV sessions found in {RAW_DATA}")
    names: list[str] | None = None
    records: list[dict[str, object]] = []
    matrix: list[list[float]] = []
    targets: list[float] = []
    for path in files:
        feature_names, values = session_features(path)
        if names is None:
            names = feature_names
        elif feature_names != names:
            raise RuntimeError(f"Feature schema changed while reading {path.name}")
        # All non-abnormal collection variants are genuine walking sessions.
        genuine = "abnormal_" not in path.stem.lower()
        record: dict[str, object] = {
            "file": path.name,
            "collection_label": path.stem.split("_andrew_", 1)[-1],
            "target": "genuine" if genuine else "altered_gait",
        }
        record.update(dict(zip(feature_names, values, strict=True)))
        records.append(record)
        matrix.append(values)
        targets.append(float(genuine))
    assert names is not None
    x, y = np.asarray(matrix), np.asarray(targets)
    loo_probability = leave_one_out(x, y)
    loo_prediction = loo_probability >= 0.5
    accuracy = float(np.mean(loo_prediction == y))
    for record, probability, prediction in zip(records, loo_probability, loo_prediction, strict=True):
        record["loo_genuine_probability"] = float(probability)
        record["loo_prediction"] = "genuine" if prediction else "altered_gait"
    false_positives = int(np.sum((loo_prediction == 1) & (y == 0)))
    false_negatives = int(np.sum((loo_prediction == 0) & (y == 1)))
    misclassified = [
        f"{record['file']} ({record['target']} -> {record['loo_prediction']}, {record['loo_genuine_probability']:.2f})"
        for record in records if record["target"] != record["loo_prediction"]
    ]
    misclassification_lines = [f"- {item}" for item in misclassified] or ["- None"]
    weights, bias, mean, scale = fit_logistic(x, y)
    write_csv(names, records)
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    MODEL_OUT.write_text(json.dumps({
        "model_type": "session_level_l2_logistic_regression",
        "positive_class": "genuine",
        "negative_class": "altered_gait",
        "feature_names": names,
        "mean": mean.tolist(),
        "scale": scale.tolist(),
        "weights": weights.tolist(),
        "bias": bias,
        "training_sessions": len(y),
        "genuine_sessions": int(y.sum()),
        "altered_gait_sessions": int(len(y) - y.sum()),
        "leave_one_session_out_accuracy": accuracy,
        "limitations": [
            "All samples are from one participant and one device.",
            "This model is a prototype quality signal, not a medical or identity decision.",
            "Collect independent participants, devices, routes, and days before deployment.",
        ],
    }, indent=2) + "\n", encoding="utf-8")
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    report = [
        "# Gait baseline report",
        "",
        f"- Sessions: {len(y)} ({int(y.sum())} genuine, {int(len(y) - y.sum())} altered-gait)",
        "- Validation: leave-one-session-out logistic-regression baseline",
        f"- Accuracy: {accuracy:.1%}",
        f"- Errors: {false_positives} altered-gait false positives; {false_negatives} genuine-session false negatives",
        "",
        "## Important limitation",
        "",
        "This is an exploratory, single-person baseline. It demonstrates an end-to-end pipeline but must not be presented as a clinically valid gait assessment or robust anti-cheat system.",
        "",
        "The model uses acceleration/gyroscope magnitudes, cadence, and spectral periodicity so it is less sensitive to phone orientation than raw XYZ values.",
        "",
        "## Misclassified held-out sessions",
        "",
        *misclassification_lines,
    ]
    REPORT_OUT.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Wrote {FEATURES_OUT.relative_to(ROOT)}")
    print(f"Wrote {MODEL_OUT.relative_to(ROOT)}")
    print(f"Wrote {REPORT_OUT.relative_to(ROOT)}")
    print(f"Leave-one-session-out accuracy: {accuracy:.1%}")


if __name__ == "__main__":
    main()
