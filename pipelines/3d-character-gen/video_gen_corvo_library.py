"""Generate Corvo's full clip library via Wan 2.1 I2V.
Same reference image (crow.webp) for every clip to hold character consistency.
Different motion prompts per clip.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path
from gradio_client import Client, handle_file

SRC = Path(r"C:\Claude\Personal\casa-companion\static\images\heroes\crow.webp")
OUT_DIR = Path(r"C:\Claude\Personal\casa-companion\static\videos\corvo")
SPACE = "multimodalart/wan2-1-fast"

BASE_STYLE = (
    "a plush cartoon crow character, iridescent black feathers with purple-green "
    "sheen, warm amber glowing eyes, small grey beak, soft grey belly, "
    "consistent character, same crow throughout"
)
NEGATIVE = (
    "blurry, distorted, extra limbs, multiple crows, deformed, text, watermark, "
    "low quality, morphing into different character, photorealistic, human features"
)

CLIPS = [
    ("speaking",
     f"{BASE_STYLE}, beak opening and closing as if speaking rhythmically, slight "
     f"head bob with each word, expressive lively movement, perched, dark forest background"),
    ("flight",
     f"{BASE_STYLE}, flying through the air with wings flapping wide, gliding "
     f"forward through a dark forest at night, moonlit, cinematic"),
    ("look_around",
     f"{BASE_STYLE}, perched, curiously turning head left and right, looking around "
     f"alertly, bright curious eyes, subtle body shifts, forest background"),
]


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


def main() -> None:
    assert SRC.exists(), f"Source missing: {SRC}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN required"

    client = Client(SPACE, token=token)

    for name, prompt in CLIPS:
        out = OUT_DIR / f"{name}.mp4"
        if out.exists():
            print(f"  SKIP {name} (already exists at {out})")
            continue
        print(f"\n→ Generating {name}...")
        print(f"  Prompt: {prompt[:80]}...")
        try:
            result = client.predict(
                input_image=handle_file(str(SRC)),
                prompt=prompt,
                height=512, width=512,
                negative_prompt=NEGATIVE,
                duration_seconds=4,
                guidance_scale=1.0,
                steps=4,
                seed=0, randomize_seed=True,
                api_name="/generate_video",
            )
            mp4 = find_mp4(result)
            if not mp4:
                print(f"  ✗ no MP4 in result")
                continue
            shutil.copy2(mp4, out)
            print(f"  ✓ {name}.mp4  ({out.stat().st_size/1024/1024:.2f} MB)")
        except Exception as e:
            print(f"  ✗ {name} failed: {e}")


if __name__ == "__main__":
    main()
