"""Train the hybrid gait authenticator after calibration data is collected.

One long recording is accepted and becomes many windows, but recording_id is
always the validation group, preventing window leakage across train/test.

Usage (do not run until the manifest contains calibration data):
  python scripts/train_gait_authenticator.py --manifest data/gait_auth_manifest.csv --subject andrew
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from gait_auth_model import FEATURE_COUNT, HybridGaitNet, fit_profile

ROOT = Path(__file__).resolve().parents[1]
HZ, WINDOW_SECONDS, STRIDE_SECONDS = 50, 5, 2.5
WALK_LABEL = "walk"
ALLOWED_ACTIVITIES = {"walk", "seated_legs", "walk_in_place", "phone_shake"}


@dataclass
class Window:
    raw: np.ndarray
    features: np.ndarray
    subject: str
    activity: str
    recording: str


def finite(row: dict[str, str], name: str) -> float:
    try:
        value = float(row[name])
        return value if math.isfinite(value) else math.nan
    except (KeyError, ValueError):
        return math.nan


def load_signal(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8")))
    t = np.asarray([finite(r, "t_ns") / 1e9 for r in rows])
    acc = np.asarray([[finite(r, k) for k in ("accel_x_mps2", "accel_y_mps2", "accel_z_mps2")] for r in rows])
    gyro = np.asarray([[finite(r, k) for k in ("gyro_x_rads", "gyro_y_rads", "gyro_z_rads")] for r in rows])
    good = np.isfinite(t) & np.all(np.isfinite(acc), axis=1) & np.all(np.isfinite(gyro), axis=1)
    t, acc, gyro = t[good], acc[good], gyro[good]
    if len(t) < HZ * WINDOW_SECONDS or t[-1] <= t[0]:
        raise ValueError(f"{path}: needs at least {WINDOW_SECONDS}s of valid accelerometer and gyroscope data")
    grid = np.arange(t[0], t[-1], 1 / HZ)
    return grid, np.column_stack([np.interp(grid, t, acc[:, i]) for i in range(3)]), np.column_stack([np.interp(grid, t, gyro[:, i]) for i in range(3)])


def percentile_stats(x: np.ndarray) -> list[float]:
    return [float(np.mean(x)), float(np.std(x)), float(np.percentile(x, 10)), float(np.percentile(x, 90)), float(np.sqrt(np.mean(x * x)))]


def transform(acc: np.ndarray, gyro: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gravity = np.mean(acc, axis=0)
    unit = gravity / max(np.linalg.norm(gravity), 1e-6)
    av = acc @ unit - np.linalg.norm(gravity)
    ah = np.linalg.norm(acc - np.outer(acc @ unit, unit), axis=1)
    gv = gyro @ unit
    gh = np.linalg.norm(gyro - np.outer(gv, unit), axis=1)
    am, gm = np.linalg.norm(acc, axis=1), np.linalg.norm(gyro, axis=1)
    jerk = np.r_[0.0, np.diff(am)] * HZ
    coupling = np.abs(av) * gm
    raw = np.stack((am - np.mean(am), av, ah - np.mean(ah), gm, gv, gh, jerk, coupling), axis=0).astype(np.float32)
    freq = np.fft.rfftfreq(len(av), 1 / HZ)
    power = np.abs(np.fft.rfft(av * np.hanning(len(av)))) ** 2
    band = (freq >= .7) & (freq <= 3.0)
    bp, bf = power[band], freq[band]
    dominant = float(bf[np.argmax(bp)]) if len(bp) and np.any(bp) else 0.0
    normalized = bp / max(float(np.sum(bp)), 1e-9)
    entropy = float(-np.sum(normalized * np.log(normalized + 1e-12)) / max(np.log(max(len(normalized), 2)), 1))
    autocorr = np.correlate(av - np.mean(av), av - np.mean(av), mode="full")[len(av)-1:]
    lag_band = autocorr[int(HZ / 3):int(HZ / .7)]
    periodicity = float(np.max(lag_band) / max(autocorr[0], 1e-9)) if len(lag_band) else 0.0
    spectral = [dominant * 60, entropy, periodicity, float(np.sum(bp) / max(np.sum(power), 1e-9)), float(np.max(bp) / max(np.sum(bp), 1e-9))]
    features = np.asarray(percentile_stats(am) + percentile_stats(gm) + percentile_stats(av) + percentile_stats(jerk) + spectral + percentile_stats(coupling), dtype=np.float32)
    assert len(features) == FEATURE_COUNT
    return raw, features


def manifest_windows(manifest: Path) -> list[Window]:
    result: list[Window] = []
    seen_recordings: set[str] = set()
    for row in csv.DictReader(manifest.open(newline="", encoding="utf-8")):
        missing = {"path", "subject_id", "activity", "recording_id"} - row.keys()
        if missing:
            raise ValueError(f"Manifest is missing columns: {sorted(missing)}")
        if row["activity"] not in ALLOWED_ACTIVITIES:
            raise ValueError(f"Unsupported activity {row['activity']!r}")
        if row["recording_id"] in seen_recordings:
            raise ValueError(f"Duplicate recording_id {row['recording_id']!r}")
        seen_recordings.add(row["recording_id"])
        path = Path(row["path"])
        if not path.is_absolute(): path = (manifest.parent / path).resolve()
        if not path.is_file():
            raise FileNotFoundError(path)
        _, acc, gyro = load_signal(path)
        size, stride = HZ * WINDOW_SECONDS, int(HZ * STRIDE_SECONDS)
        for start in range(0, len(acc) - size + 1, stride):
            raw, features = transform(acc[start:start + size], gyro[start:start + size])
            result.append(Window(raw, features, row["subject_id"], row["activity"], row["recording_id"]))
    if not result: raise ValueError("Manifest produced no valid windows")
    return result


def choose_validation_recordings(windows: list[Window]) -> set[str]:
    """Hold out one complete recording per repeatable subject/activity group."""
    groups: dict[tuple[str, str], set[str]] = defaultdict(set)
    for window in windows:
        groups[(window.subject, window.activity)].add(window.recording)
    return {sorted(recordings)[-1] for recordings in groups.values() if len(recordings) >= 2}


def class_weights(labels: torch.Tensor, class_count: int) -> torch.Tensor:
    counts = torch.bincount(labels, minlength=class_count).float().clamp_min(1)
    return labels.numel() / (class_count * counts)


def evaluate_sessions(
    windows: list[Window],
    model: HybridGaitNet,
    device: torch.device,
    raw_mean: np.ndarray,
    raw_scale: np.ndarray,
    feature_mean: np.ndarray,
    feature_scale: np.ndarray,
    activity_index: dict[str, int],
    owner: str,
    profile,
    use_network_embedding: bool,
) -> tuple[list[dict[str, object]], dict[str, float | int | None]]:
    by_recording: dict[str, list[Window]] = defaultdict(list)
    for window in windows:
        by_recording[window.recording].append(window)
    results: list[dict[str, object]] = []
    center = np.asarray(profile.center)
    scale = np.asarray(profile.scale)
    model.eval()
    for recording, session in sorted(by_recording.items()):
        raw_values = np.stack([w.raw for w in session])
        feature_values = np.stack([w.features for w in session])
        raw_values = (raw_values - raw_mean[None, :, None]) / raw_scale[None, :, None]
        normalized_features = (feature_values - feature_mean) / feature_scale
        with torch.no_grad():
            embeddings, activity_logits, _ = model(
                torch.tensor(raw_values, dtype=torch.float32, device=device),
                torch.tensor(normalized_features, dtype=torch.float32, device=device),
            )
        walk_fraction = float(np.mean(activity_logits.argmax(dim=1).cpu().numpy() == activity_index[WALK_LABEL]))
        identity_values = embeddings.cpu().numpy() if use_network_embedding else normalized_features
        distances = np.sqrt(np.mean(((identity_values - center) / scale) ** 2, axis=1))
        identity_fraction = float(np.mean(distances <= profile.accept_distance))
        accepted = bool(
            len(session) >= profile.minimum_windows
            and walk_fraction >= 0.70
            and identity_fraction >= profile.required_window_fraction
        )
        subject, activity = session[0].subject, session[0].activity
        expected = subject == owner and activity == WALK_LABEL
        results.append({
            "recording_id": recording,
            "subject_id": subject,
            "activity": activity,
            "windows": len(session),
            "walk_window_fraction": walk_fraction,
            "identity_window_fraction": identity_fraction,
            "mean_identity_distance": float(np.mean(distances)),
            "accepted": accepted,
            "expected_accept": expected,
            "correct": accepted == expected,
        })

    genuine = [r for r in results if r["subject_id"] == owner and r["activity"] == WALK_LABEL]
    impostor = [r for r in results if r["subject_id"] != owner and r["activity"] == WALK_LABEL]
    spoofs = [r for r in results if r["activity"] != WALK_LABEL]
    rate = lambda numerator, denominator: float(numerator / denominator) if denominator else None
    metrics: dict[str, float | int | None] = {
        "sessions": len(results),
        "correct_sessions": sum(bool(r["correct"]) for r in results),
        "session_accuracy": rate(sum(bool(r["correct"]) for r in results), len(results)),
        "genuine_sessions": len(genuine),
        "false_rejects": sum(not bool(r["accepted"]) for r in genuine),
        "false_reject_rate": rate(sum(not bool(r["accepted"]) for r in genuine), len(genuine)),
        "impostor_walk_sessions": len(impostor),
        "false_accepts": sum(bool(r["accepted"]) for r in impostor),
        "false_accept_rate": rate(sum(bool(r["accepted"]) for r in impostor), len(impostor)),
        "spoof_sessions": len(spoofs),
        "spoof_accepts": sum(bool(r["accepted"]) for r in spoofs),
        "spoof_accept_rate": rate(sum(bool(r["accepted"]) for r in spoofs), len(spoofs)),
    }
    return results, metrics


def write_report(path: Path, metadata: dict[str, object]) -> None:
    validation = metadata["evaluation"]["validation"]
    lines = [
        "# Gait authenticator training report",
        "",
        f"- Owner: `{metadata['owner_subject']}`",
        f"- Subjects: {', '.join(metadata['subjects'])}",
        f"- Training windows: {metadata['training_windows']}",
        f"- Validation windows: {metadata['validation_windows']}",
        f"- Parameters: {metadata['parameter_count']:,}",
        f"- Profile mode: `{metadata['profile']['mode']}`",
        "",
        "## Held-out session metrics",
        "",
        f"- Accuracy: {validation['metrics']['correct_sessions']}/{validation['metrics']['sessions']}",
        f"- False rejects: {validation['metrics']['false_rejects']}/{validation['metrics']['genuine_sessions']}",
        f"- False accepts (other people walking): {validation['metrics']['false_accepts']}/{validation['metrics']['impostor_walk_sessions']}",
        f"- Accepted spoof sessions: {validation['metrics']['spoof_accepts']}/{validation['metrics']['spoof_sessions']}",
        "",
        "| Recording | Subject | Activity | Walk fraction | Identity fraction | Decision | Expected |",
        "|---|---|---|---:|---:|---|---|",
    ]
    for result in validation["sessions"]:
        lines.append(
            f"| {result['recording_id']} | {result['subject_id']} | {result['activity']} | "
            f"{result['walk_window_fraction']:.3f} | {result['identity_window_fraction']:.3f} | "
            f"{'accept' if result['accepted'] else 'reject'} | {'accept' if result['expected_accept'] else 'reject'} |"
        )
    lines.extend([
        "",
        "## Important limitation",
        "",
        f"These held-out results contain only one owner walk and {metadata['other_subject_count']} other people. They verify that the pipeline runs and separates this small collection; they are not a reliable population-level FAR/FRR estimate.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "models" / "gait_authenticator")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--device", default="auto", help="auto, cpu, cuda, or another PyTorch device")
    args = parser.parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(args.seed)
    device = torch.device("cuda" if args.device == "auto" and torch.cuda.is_available() else ("cpu" if args.device == "auto" else args.device))
    windows = manifest_windows(args.manifest.resolve())
    subjects, activities = sorted({w.subject for w in windows}), sorted({w.activity for w in windows})
    if args.subject not in subjects: raise SystemExit(f"Subject {args.subject!r} is absent from manifest")
    if WALK_LABEL not in activities: raise SystemExit("Manifest contains no walk activity")
    validation_recordings = choose_validation_recordings(windows)
    train = [w for w in windows if w.recording not in validation_recordings]
    validation = [w for w in windows if w.recording in validation_recordings]
    if not any(w.subject == args.subject and w.activity == WALK_LABEL for w in train):
        raise SystemExit("Training split contains no owner walking windows")
    raw_values = np.stack([w.raw for w in train])
    raw_mean = np.mean(raw_values, axis=(0, 2))
    raw_scale = np.maximum(np.std(raw_values, axis=(0, 2)), 1e-5)
    feature_mean = np.mean([w.features for w in train], axis=0)
    feature_scale = np.maximum(np.std([w.features for w in train], axis=0), 1e-5)
    subject_index, activity_index = {v: i for i, v in enumerate(subjects)}, {v: i for i, v in enumerate(activities)}
    raw = torch.tensor((raw_values - raw_mean[None, :, None]) / raw_scale[None, :, None], dtype=torch.float32)
    features = torch.tensor(np.stack([(w.features - feature_mean) / feature_scale for w in train]), dtype=torch.float32)
    activity = torch.tensor([activity_index[w.activity] for w in train])
    identity = torch.tensor([subject_index[w.subject] for w in train])
    model = HybridGaitNet(len(subjects), len(activities)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(args.seed)
    loader = DataLoader(TensorDataset(raw, features, activity, identity), batch_size=32, shuffle=True, generator=generator)
    activity_weights = class_weights(activity, len(activities)).to(device)
    identity_weights = class_weights(identity[activity == activity_index[WALK_LABEL]], len(subjects)).to(device)
    final_loss = math.nan
    for epoch in range(args.epochs):
        model.train()
        running_loss = 0.0
        for xb, fb, ab, ib in loader:
            xb, fb, ab, ib = xb.to(device), fb.to(device), ab.to(device), ib.to(device)
            _, activity_logits, identity_logits = model(xb, fb)
            loss = nn.functional.cross_entropy(activity_logits, ab, weight=activity_weights)
            walking = ab == activity_index.get(WALK_LABEL, -1)
            if len(subjects) > 1 and torch.any(walking):
                loss = loss + nn.functional.cross_entropy(identity_logits[walking], ib[walking], weight=identity_weights)
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            running_loss += float(loss.detach().cpu()) * len(xb)
        final_loss = running_loss / len(train)
        if epoch == 0 or (epoch + 1) % 10 == 0 or epoch + 1 == args.epochs:
            print(f"epoch {epoch + 1:3d}/{args.epochs}: loss={final_loss:.5f}", flush=True)
    model.eval()
    with torch.no_grad(): embeddings, _, _ = model(raw.to(device), features.to(device))
    embedded = embeddings.cpu().numpy() if len(subjects) > 1 else features.numpy()
    genuine = embedded[np.asarray([(w.subject == args.subject and w.activity == WALK_LABEL) for w in train])]
    impostor = embedded[np.asarray([(w.subject != args.subject and w.activity == WALK_LABEL) for w in train])]
    other_subjects = sorted({w.subject for w in windows if w.subject != args.subject and w.activity == WALK_LABEL})
    impostor_subjects = len({w.subject for w in train if w.subject != args.subject and w.activity == WALK_LABEL})
    profile = fit_profile(args.subject, genuine, impostor if len(impostor) else None, impostor_subjects)
    if len(subjects) == 1: profile.mode = "engineered_one_class"
    train_sessions, train_metrics = evaluate_sessions(train, model, device, raw_mean, raw_scale, feature_mean, feature_scale, activity_index, args.subject, profile, len(subjects) > 1)
    validation_sessions, validation_metrics = evaluate_sessions(validation, model, device, raw_mean, raw_scale, feature_mean, feature_scale, activity_index, args.subject, profile, len(subjects) > 1) if validation else ([], {})
    args.output.mkdir(parents=True, exist_ok=True)
    torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, args.output / "network.pt")
    metadata = {
        "architecture": "hybrid_depthwise_1d_cnn_features",
        "trained": True,
        "owner_subject": args.subject,
        "subjects": subjects,
        "other_subject_count": len(other_subjects),
        "activities": activities,
        "window_seconds": WINDOW_SECONDS,
        "stride_seconds": STRIDE_SECONDS,
        "sample_rate_hz": HZ,
        "raw_mean": raw_mean.tolist(),
        "raw_scale": raw_scale.tolist(),
        "feature_mean": feature_mean.tolist(),
        "feature_scale": feature_scale.tolist(),
        "profile": profile.to_json(),
        "activity_required_walk_fraction": 0.70,
        "training_recordings": sorted({w.recording for w in train}),
        "validation_recordings": sorted(validation_recordings),
        "training_windows": len(train),
        "validation_windows": len(validation),
        "epochs": args.epochs,
        "seed": args.seed,
        "final_training_loss": final_loss,
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "evaluation": {
            "training": {"sessions": train_sessions, "metrics": train_metrics},
            "validation": {"sessions": validation_sessions, "metrics": validation_metrics},
        },
        "limitations": [
            f"The held-out set contains only one owner walk and {len(other_subjects)} other people.",
            f"{len(other_subjects)} other people are insufficient for a population-level false-accept estimate.",
            "Collect cross-day, footwear, speed, and pocket-placement sessions before production enforcement.",
        ],
    }
    (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    write_report(args.output / "training_report.md", metadata)
    print(f"Wrote trained model, profile, evaluation, and report to {args.output}")


if __name__ == "__main__": main()
