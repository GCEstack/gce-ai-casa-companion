"""
Push the Corvo hero art through trellis-community/TRELLIS HF Space.
Returns a textured GLB we can load in Three.js.

Needs:  pip install gradio_client  (already in .venv-seg)
Needs:  HF_TOKEN env var
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

from gradio_client import Client, handle_file

SRC = PROJECT_ROOT / "tv-companion" / "static" / "images" / "heroes" / "crow.webp"
OUT_DIR = PROJECT_ROOT / "tv-companion" / "static" / "corvo_3d"

SPACE = "trellis-community/TRELLIS"


def main() -> None:
    assert SRC.exists(), f"Source missing: {SRC}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN env var required"

    print(f"Connecting to {SPACE}...")
    client = Client(SPACE, token=token)

    # Session setup (per trellis-community API)
    try:
        client.predict(api_name="/start_session")
    except Exception as e:
        print(f"  (start_session noop: {e})")

    print(f"Submitting {SRC.name}...")
    print(f"Expect ~60-120s (ZeroGPU queue + inference)")

    result = client.predict(
        image={"path": str(SRC), "meta": {"_type": "gradio.FileData"}},
        multiimages=[],
        seed=42,
        ss_guidance_strength=7.5,
        ss_sampling_steps=12,
        slat_guidance_strength=3.0,
        slat_sampling_steps=12,
        multiimage_algo="stochastic",
        mesh_simplify=0.95,
        texture_size=1024,
        api_name="/generate_and_extract_glb",
    )

    # Result shape for this endpoint: (video_preview_path, glb_path, download_path)
    print(f"\nRaw result type: {type(result)}")
    if isinstance(result, (list, tuple)):
        for i, item in enumerate(result):
            print(f"  [{i}] {item}")

    # Extract GLB — typically index 1, sometimes a dict
    glb_candidate = None
    if isinstance(result, (list, tuple)):
        for item in result:
            s = str(item)
            if s.endswith(".glb"):
                glb_candidate = item
                break
    if glb_candidate is None:
        # Fall back to second element
        glb_candidate = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else result

    if isinstance(glb_candidate, dict):
        glb_candidate = glb_candidate.get("path") or glb_candidate.get("url")

    assert glb_candidate, "Could not locate GLB path in result"
    print(f"\nGLB source: {glb_candidate}")

    dest = OUT_DIR / "corvo.glb"
    shutil.copy2(glb_candidate, dest)
    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"Saved: {dest}  ({size_mb:.2f} MB)")

    # Also save the video preview if present
    if isinstance(result, (list, tuple)) and result and str(result[0]).endswith(".mp4"):
        vdest = OUT_DIR / "corvo_preview.mp4"
        shutil.copy2(result[0], vdest)
        print(f"Preview video: {vdest}")


if __name__ == "__main__":
    main()
