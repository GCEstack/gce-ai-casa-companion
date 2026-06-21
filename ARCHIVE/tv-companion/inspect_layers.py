"""Check which See-through output layers actually contain pixels."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
from PIL import Image
import numpy as np

LAYERS_DIR = PROJECT_ROOT / "tv-companion" / "static" / "corvo_layers"

results = []
for p in sorted(LAYERS_DIR.glob("*.png")):
    img = np.array(Image.open(p).convert("RGBA"))
    alpha = img[..., 3]
    opaque_px = (alpha > 20).sum()
    total_px = alpha.size
    pct = opaque_px / total_px * 100
    # bounding box of non-empty
    if opaque_px > 0:
        ys, xs = np.where(alpha > 20)
        bbox = f"x=[{xs.min()}-{xs.max()}] y=[{ys.min()}-{ys.max()}]"
    else:
        bbox = "EMPTY"
    results.append((p.name, pct, bbox, opaque_px))

results.sort(key=lambda r: -r[1])
print(f"{'Layer':30s}  {'% opaque':>10s}  {'bbox':40s}")
print("-" * 85)
for name, pct, bbox, px in results:
    marker = "★" if pct > 0.5 else " "
    print(f"{marker} {name:28s}  {pct:>9.2f}%  {bbox}")
