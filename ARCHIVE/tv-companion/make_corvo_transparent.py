
"""
Bake transparency into Corvo PNGs.
The FLUX generator put a pure-black (#000000) background on every frame.
This chroma-keys the background out so Corvo actually sits in the forest
scene instead of in a visible black rectangle.

Soft edge: pixels with luminance < LOW go fully transparent,
pixels with luminance > HIGH stay fully opaque,
in-between pixels get a smooth alpha ramp (no jagged edges).

Originals are backed up to corvo/_original/ before the overwrite.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import glob
import shutil
from pathlib import Path
import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = PROJECT_ROOT / "tv-companion" / "static" / "images" / "tv" / "corvo"
BACKUP_DIR = SRC_DIR / "_original"

LOW = 10    # below this luminance → fully transparent
HIGH = 32   # above this luminance → fully opaque


def process(path: str) -> None:
    name = os.path.basename(path)
    backup_path = os.path.join(BACKUP_DIR, name)
    if not os.path.exists(backup_path):
        shutil.copy2(path, backup_path)

    img = np.array(Image.open(path).convert("RGBA"))
    r = img[..., 0].astype(np.float32)
    g = img[..., 1].astype(np.float32)
    b = img[..., 2].astype(np.float32)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    alpha = np.clip((lum - LOW) / (HIGH - LOW), 0.0, 1.0)
    img[..., 3] = (alpha * 255).astype(np.uint8)

    Image.fromarray(img).save(path, optimize=True)
    opaque_pct = (alpha > 0.5).mean() * 100
    print(f"  OK {name} ({opaque_pct:.1f}% opaque)")


def main() -> None:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    frames = sorted(glob.glob(os.path.join(SRC_DIR, "corvo_*.png")))
    print(f"Processing {len(frames)} frames from {SRC_DIR}")
    print(f"Originals backed up to {BACKUP_DIR}")
    print()
    for path in frames:
        process(path)
    print()
    print("Done. Hard-refresh the browser to see transparent Corvo.")


if __name__ == "__main__":
    main()
