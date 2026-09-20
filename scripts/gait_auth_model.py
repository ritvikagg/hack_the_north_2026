"""Small hybrid network and personalized profile used by gait authentication."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Sequence

import numpy as np
import torch
from torch import nn


RAW_CHANNELS = 8
FEATURE_COUNT = 30
EMBEDDING_SIZE = 64


class SeparableBlock(nn.Module):
    def __init__(self, inputs: int, outputs: int, kernel: int, dilation: int = 1) -> None:
        super().__init__()
        padding = dilation * (kernel - 1) // 2
        self.layers = nn.Sequential(
            nn.Conv1d(inputs, inputs, kernel, padding=padding, dilation=dilation, groups=inputs, bias=False),
            nn.Conv1d(inputs, outputs, 1, bias=False),
            nn.BatchNorm1d(outputs),
            nn.ReLU(),
        )

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return self.layers(values)


class HybridGaitNet(nn.Module):
    """Raw temporal branch + explainable feature branch + two training heads."""

    def __init__(self, subject_count: int, activity_count: int) -> None:
        super().__init__()
        self.temporal = nn.Sequential(
            SeparableBlock(RAW_CHANNELS, 32, 7),
            nn.MaxPool1d(2),
            SeparableBlock(32, 64, 5, dilation=2),
            nn.MaxPool1d(2),
            SeparableBlock(64, 96, 3, dilation=4),
        )
        self.feature_branch = nn.Sequential(nn.Linear(FEATURE_COUNT, 32), nn.ReLU(), nn.Dropout(0.15))
        self.fusion = nn.Sequential(nn.Linear(96 * 2 + 32, EMBEDDING_SIZE), nn.ReLU(), nn.Dropout(0.20))
        self.activity_head = nn.Linear(EMBEDDING_SIZE, activity_count)
        self.identity_head = nn.Linear(EMBEDDING_SIZE, max(subject_count, 1))

    def forward(self, raw: torch.Tensor, features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        temporal = self.temporal(raw)
        pooled = torch.cat((temporal.mean(dim=-1), temporal.amax(dim=-1)), dim=1)
        embedding = self.fusion(torch.cat((pooled, self.feature_branch(features)), dim=1))
        return embedding, self.activity_head(embedding), self.identity_head(embedding)


@dataclass
class GaitProfile:
    subject_id: str
    mode: str
    center: list[float]
    scale: list[float]
    accept_distance: float
    required_window_fraction: float = 0.70
    minimum_windows: int = 5
    warning: str | None = None

    def to_json(self) -> dict[str, object]:
        return asdict(self)


def fit_profile(
    subject_id: str,
    genuine: np.ndarray,
    impostor: np.ndarray | None = None,
    impostor_subject_count: int = 0,
) -> GaitProfile:
    """Fit a diagonal-Mahalanobis profile; works with zero, one, or many impostors."""
    if len(genuine) < 5:
        raise ValueError("At least five genuine windows are required")
    center = np.median(genuine, axis=0)
    mad = np.median(np.abs(genuine - center), axis=0) * 1.4826
    scale = np.maximum(mad, 0.10)
    genuine_distance = np.sqrt(np.mean(((genuine - center) / scale) ** 2, axis=1))
    one_class_threshold = float(np.quantile(genuine_distance, 0.95) * 1.15)
    mode, threshold, warning = "one_class", one_class_threshold, "No impostor data: identity confidence is provisional."
    if impostor is not None and len(impostor):
        impostor_distance = np.sqrt(np.mean(((impostor - center) / scale) ** 2, axis=1))
        candidates = np.unique(np.concatenate((genuine_distance, impostor_distance)))
        # Minimize balanced window error. The previous FAR-first ordering could
        # select the smallest observed distance and reject nearly every genuine
        # window merely to obtain zero false accepts.
        threshold = float(min(
            candidates,
            key=lambda t: (
                np.mean(impostor_distance <= t) + np.mean(genuine_distance > t),
                np.mean(impostor_distance <= t),
                np.mean(genuine_distance > t),
                t,
            ),
        ))
        if impostor_subject_count >= 5:
            mode, warning = "cohort_calibrated", None
        elif impostor_subject_count > 1:
            mode, warning = "small_cohort", "Small impostor cohort: validate with more people before relying on identity."
        else:
            mode, warning = "one_impostor", "Only one impostor person: validate with more people before relying on identity."
    return GaitProfile(subject_id, mode, center.tolist(), scale.tolist(), threshold, warning=warning)


def session_accepts(distances: Sequence[float], profile: GaitProfile) -> bool:
    if len(distances) < profile.minimum_windows:
        return False
    return float(np.mean(np.asarray(distances) <= profile.accept_distance)) >= profile.required_window_fraction
