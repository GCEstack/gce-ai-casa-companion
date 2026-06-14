"""Generate a Stellino idle clip via Wan 2.1 I2V, same pipeline as Corvo."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path
from gradio_client import Client, handle_file

SRC = Path(r"C:\Claude\Personal\casa-companion\static\images\heroes\stellino.webp")
OUT_DIR = Path(r"C:\Claude\Personal\casa-companion\static\videos\stellino")
SPACE = "multimodalart/wan2-1-fast"

PROMPT = (
    "a small cute alien plush character floating gently in a dark starlit space, "
    "softly breathing, tiny blinks, slight body sway, glowing eyes, pastel iridescent skin, "
    "calm ambient atmosphere, cinematic, serene"
)
NEGATIVE = (
    "blurry, distorted, extra limbs, deformed, text, watermark, low quality, "
    "morphing into different character, multiple characters"
)


def main() -> None:
    assert SRC.exists(), f"Source missing: {SRC}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN required"

    client = Client(SPACE, token=token)
    print(f"Submitting stellino idle clip...")

    result = client.predict(
        input_image=handle_file(str(SRC)),
        prompt=PROMPT,
        height=512, width=512,
        negative_prompt=NEGATIVE,
        duration_seconds=4,
        guidance_scale=1.0,
        steps=4,
        seed=0, randomize_seed=True,
        api_name="/generate_video",
    )

    def find_mp4(o):
        if isinstance(o, str) and o.endswith(".mp4"): return o
        if isinstance(o, dict):
            for v in o.values():
                h = find_mp4(v)
                if h: return h
        if isinstance(o, (list, tuple)):
            for v in o:
                h = find_mp4(v)
                if h: return h
        return None

    mp4 = find_mp4(result)
    assert mp4, "No MP4 returned"
    dest = OUT_DIR / "idle.mp4"
    shutil.copy2(mp4, dest)
    print(f"Saved: {dest}  ({dest.stat().st_size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
