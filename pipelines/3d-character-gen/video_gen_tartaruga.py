"""Generate a Tartaruga (Sea Turtle) idle clip via Wan 2.1 I2V, same pipeline as Corvo and Stellino."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path

from gradio_client import Client, handle_file

# Use relative paths for cross-platform compatibility
SRC = Path(__file__).parent / "static" / "images" / "heroes" / "turtle.webp"
OUT_DIR = Path(__file__).parent / "static" / "videos" / "tartaruga"
SPACE = "multimodalart/wan2-1-fast"

PROMPT = (
    "a soft cute plush sea turtle character with shimmering blue-green shell and kind ancient eyes, "
    "gently floating in calm underwater scene, soft flipper movement, slow peaceful blinks, "
    "warm ambient light filtering through water, serene ocean atmosphere, cinematic, calm"
)
NEGATIVE = (
    "blurry, distorted, extra limbs, deformed, text, watermark, low quality, "
    "morphing into different character, multiple characters, scary, aggressive"
)


def main() -> None:
    assert SRC.exists(), f"Source missing: {SRC}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN environment variable required. Get one at huggingface.co/settings/tokens"

    print(f"Source image: {SRC}")
    print(f"Output directory: {OUT_DIR}")
    print(f"Connecting to {SPACE}...")
    client = Client(SPACE, token=token)

    print(f"Submitting Tartaruga idle clip...")
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

    def find_mp4(o):
        if isinstance(o, str) and o.endswith(".mp4"):
            return o
        if isinstance(o, dict):
            for v in o.values():
                h = find_mp4(v)
                if h:
                    return h
        if isinstance(o, (list, tuple)):
            for v in o:
                h = find_mp4(v)
                if h:
                    return h
        return None

    mp4 = find_mp4(result)
    assert mp4, "No MP4 returned from model"

    dest = OUT_DIR / "idle.mp4"
    shutil.copy2(mp4, dest)
    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"\nSaved: {dest}  ({size_mb:.2f} MB)")
    print(f"Served at: /static/videos/tartaruga/idle.mp4")
    print(f"\nNext steps:")
    print(f"  1. Copy to web-revamp: cp {dest} ../web-revamp/public/videos/tartaruga_idle.mp4")
    print(f"  2. Update characterVideos.ts with: tartaruga: {{ idle: '/videos/tartaruga_idle.mp4', speaking: '/videos/tartaruga_speaking.mp4' }}")


if __name__ == "__main__":
    main()
