"""Export the trained gait authenticator and verify ONNX/PyTorch parity."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gait_auth_model import FEATURE_COUNT, RAW_CHANNELS, HybridGaitNet  # noqa: E402
from train_gait_authenticator import HZ, WINDOW_SECONDS, load_signal, manifest_windows  # noqa: E402


class MobileGaitModel(nn.Module):
    def __init__(self, network: HybridGaitNet) -> None:
        super().__init__()
        self.network = network

    def forward(self, raw: torch.Tensor, features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        embedding, activity_logits, _ = self.network(raw, features)
        return embedding, activity_logits


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, default=ROOT / "models" / "gait_authenticator")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data" / "gait_auth_manifest.csv")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "frontend" / "assets" / "models")
    parser.add_argument("--fixture", type=Path, default=ROOT / "frontend" / "tests" / "fixtures" / "gait_preprocessing_reference.json")
    args = parser.parse_args()

    metadata_path = args.model_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    network = HybridGaitNet(len(metadata["subjects"]), len(metadata["activities"]))
    state = torch.load(args.model_dir / "network.pt", weights_only=True, map_location="cpu")
    network.load_state_dict(state)
    model = MobileGaitModel(network.eval()).eval()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "gait_authenticator.onnx"
    bundled_metadata_path = args.output_dir / "gait_authenticator.metadata.json"
    raw_example = torch.zeros(1, RAW_CHANNELS, HZ * WINDOW_SECONDS, dtype=torch.float32)
    feature_example = torch.zeros(1, FEATURE_COUNT, dtype=torch.float32)
    torch.onnx.export(
        model,
        (raw_example, feature_example),
        model_path,
        input_names=["raw", "features"],
        output_names=["embedding", "activity_logits"],
        dynamic_axes={
            "raw": {0: "windows"},
            "features": {0: "windows"},
            "embedding": {0: "windows"},
            "activity_logits": {0: "windows"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    onnx.checker.check_model(onnx.load(model_path))

    windows = manifest_windows(args.manifest.resolve())
    selected = [windows[0], windows[len(windows) // 2], windows[-1]]
    raw_mean = np.asarray(metadata["raw_mean"], dtype=np.float32)
    raw_scale = np.asarray(metadata["raw_scale"], dtype=np.float32)
    feature_mean = np.asarray(metadata["feature_mean"], dtype=np.float32)
    feature_scale = np.asarray(metadata["feature_scale"], dtype=np.float32)
    raw = np.stack([(window.raw - raw_mean[:, None]) / raw_scale[:, None] for window in selected]).astype(np.float32)
    features = np.stack([(window.features - feature_mean) / feature_scale for window in selected]).astype(np.float32)
    with torch.no_grad():
        torch_embedding, torch_activity = model(torch.from_numpy(raw), torch.from_numpy(features))
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    onnx_embedding, onnx_activity = session.run(None, {"raw": raw, "features": features})
    embedding_error = float(np.max(np.abs(torch_embedding.numpy() - onnx_embedding)))
    activity_error = float(np.max(np.abs(torch_activity.numpy() - onnx_activity)))
    if max(embedding_error, activity_error) > 1e-4:
        raise RuntimeError(f"ONNX parity failed: embedding={embedding_error}, activity={activity_error}")

    shutil.copy2(metadata_path, bundled_metadata_path)
    first_manifest_row = next(csv.DictReader(args.manifest.open(newline="", encoding="utf-8")))
    first_path = Path(first_manifest_row["path"])
    if not first_path.is_absolute():
        first_path = (args.manifest.parent / first_path).resolve()
    grid, acceleration, rotation = load_signal(first_path)
    fixture_count = HZ * WINDOW_SECONDS + 1
    fixture = {
        "samples": [
            {
                "timestampSeconds": float(index / HZ),
                "accelerationMps2": acceleration[index].tolist(),
                "rotationRads": rotation[index].tolist(),
            }
            for index in range(fixture_count)
        ],
        "expectedNormalizedRaw": raw[0].reshape(-1).tolist(),
        "expectedNormalizedFeatures": features[0].tolist(),
    }
    args.fixture.parent.mkdir(parents=True, exist_ok=True)
    args.fixture.write_text(json.dumps(fixture, separators=(",", ":")) + "\n", encoding="utf-8")
    digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
    print(f"Wrote {model_path} ({model_path.stat().st_size} bytes, sha256={digest})")
    print(f"Bundled {bundled_metadata_path}")
    print(f"Wrote preprocessing parity fixture {args.fixture}")
    print(f"Parity passed: embedding max error={embedding_error:.8g}, activity max error={activity_error:.8g}")


if __name__ == "__main__":
    main()
