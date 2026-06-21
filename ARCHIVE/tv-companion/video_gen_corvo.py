"""
Image-to-video via multimodalart/wan2-1-fast (Wan 2.1 + CausVid LoRA, 4 steps).
Feed Corvo's hero PNG + a motion prompt, get MP4 back.

First run: generate ONE test clip (idle) so Peter can eyeball character
consistency before we spin the full library.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

from gradio_client import Client, handle_file

SRC = PROJECT_ROOT / "tv-companion" / "static" / "images" / "heroes" / "crow.webp"
OUT_DIR = PROJECT_ROOT / "tv-companion" / "static" / "videos" / "corvo"
SPACE = "multimodalart/wan2-1-fast"

# First test — idle. Short, simple motion so we can see if the character
# holds together.
PROMPT = (
    "a plush cartoon crow character perched on a branch in a dark forest at night, "
    "gently breathing, soft feather ruffle, blinks slowly, warm amber eyes, "
    "iridescent black feathers, moonlit atmosphere, cinematic, calm, serene"
)
NEGATIVE = (
    "blurry, distorted, extra limbs, multiple crows, deformed, text, watermark, "
    "low quality, unrealistic proportions, morphing into different character"
)


def main() -> None:
    assert SRC.exists(), f"Source missing: {SRC}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN env var required"

    print(f"Connecting to {SPACE}...")
    client = Client(SPACE, token=token)

    print(f"Submitting idle clip...")
    print(f"  Prompt: {PROMPT[:80]}...")
    print(f"  Expect ~30-60s on ZeroGPU")

    result = client.predict(
        input_image=handle_file(str(SRC)),
        prompt=PROMPT,
        height=512,
        width=512,
        negative_prompt=NEGATIVE,
        duration_seconds=4,
        guidance_scale=1.0,
        steps=4,
        seed=0,
        randomize_seed=True,
        api_name="/generate_video",
    )

    print(f"\nResult type: {type(result)}")
    if isinstance(result, (list, tuple)):
        for i, item in enumerate(result):
            print(f"  [{i}] {item}")

    # Locate the MP4 in the result structure
    def find_mp4(obj):
        if isinstance(obj, str) and obj.endswith(".mp4"):
            return obj
        if isinstance(obj, dict):
            for v in obj.values():
                hit = find_mp4(v)
                if hit:
                    return hit
        if isinstance(obj, (list, tuple)):
            for v in obj:
                hit = find_mp4(v)
                if hit:
                    return hit
        return None

    mp4_src = find_mp4(result)
    assert mp4_src, "No MP4 in result"

    dest = OUT_DIR / "idle.mp4"
    shutil.copy2(mp4_src, dest)
    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"\nSaved: {dest}  ({size_mb:.2f} MB)")
    print(f"Served at: /static/videos/corvo/idle.mp4")


if __name__ == "__main__":
    main()
