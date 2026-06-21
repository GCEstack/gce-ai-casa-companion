"""
Push Corvo through the See-through HuggingFace Space to get a layered PSD.
Uses the original (black-bg) PNG — See-through handles background inpainting.

Output:
  workspace/corvo_psd/corvo_wings_spread.psd    → full PSD with all semantic layers
  workspace/corvo_layers/*.png                  → each layer as transparent PNG

Requires: pip install gradio_client pillow
Optional env var: HF_TOKEN (needed if ZeroGPU quota is exhausted for anonymous)
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

from gradio_client import Client, handle_file

# --- Input: use the ORIGINAL (pre-alpha-bake) wings_spread frame.
# That pose shows the most anatomy — both wings, beak, eyes, tail.
SRC = PROJECT_ROOT / "tv-companion" / "static" / "images" / "tv" / "corvo" / "_original" / "corvo_wings_spread.png"

WORKSPACE = PROJECT_ROOT / "tv-companion" / "static"
PSD_OUT = WORKSPACE / "corvo_psd"
LAYERS_OUT = WORKSPACE / "corvo_layers"

SPACE_ID = "24yearsold/see-through-demo"
RESOLUTION = 1024  # 768 fastest, 1280 highest quality; 1024 is our balance


def main() -> None:
    assert SRC.exists(), f"Source image missing: {SRC}"
    PSD_OUT.mkdir(parents=True, exist_ok=True)
    LAYERS_OUT.mkdir(parents=True, exist_ok=True)

    hf_token = os.getenv("HF_TOKEN")
    print(f"Connecting to Space {SPACE_ID} (token={'yes' if hf_token else 'anonymous'})...")

    client = Client(SPACE_ID, token=hf_token) if hf_token else Client(SPACE_ID)

    print(f"Submitting {SRC.name} at resolution {RESOLUTION}...")
    print("(ZeroGPU allocates up to 120s — expect 1–3 minutes total)")
    result = client.predict(
        image=handle_file(str(SRC)),
        resolution=RESOLUTION,
        seed=42,
        api_name="/inference",
    )

    # Return shape: (psd_filepath, [{'image': path, 'caption': layer_name}, ...])
    psd_path, gallery = result
    print(f"\nPSD: {psd_path}")
    print(f"Gallery: {len(gallery)} layers")

    # Copy PSD into the workspace
    psd_dest = PSD_OUT / "corvo_wings_spread.psd"
    shutil.copy2(psd_path, psd_dest)
    print(f"  → {psd_dest}")

    # Copy each layer PNG and name it by the layer caption
    print("\nLayers:")
    for i, item in enumerate(gallery):
        img_path = item["image"] if isinstance(item, dict) else item[0]
        caption = item.get("caption", f"layer_{i:02d}") if isinstance(item, dict) else f"layer_{i:02d}"
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in caption).strip("_").lower()
        if not safe:
            safe = f"layer_{i:02d}"
        out = LAYERS_OUT / f"{safe}.png"
        shutil.copy2(img_path, out)
        print(f"  {i:02d} {caption:30s} → {out.name}")

    print(f"\nDone. Layers in {LAYERS_OUT}")


if __name__ == "__main__":
    main()
