"""Fallback path: use HF Inference Providers (fal-ai / replicate) for image-to-video.
Billed against the HF account's monthly credits. Tries Wan 2.2 I2V first, falls back.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
from huggingface_hub import InferenceClient

SRC = PROJECT_ROOT / "tv-companion" / "static" / "images" / "heroes" / "crow.webp"
OUT = PROJECT_ROOT / "tv-companion" / "static" / "videos" / "corvo" / "speaking.mp4"

PROMPT = (
    "a plush cartoon crow character, iridescent black feathers, warm amber eyes, "
    "grey beak opening and closing as if speaking rhythmically, slight head bob with "
    "each word, expressive lively movement, perched, dark forest background, cinematic"
)


def try_provider(provider: str, model: str, token: str) -> bytes:
    print(f"  provider={provider}  model={model}")
    client = InferenceClient(provider=provider, api_key=token)
    with open(SRC, "rb") as f:
        image_bytes = f.read()
    # Method signature may vary across hub versions — try several
    for attempt in ("image_to_video", "post"):
        try:
            if attempt == "image_to_video":
                out = client.image_to_video(
                    image=image_bytes,
                    prompt=PROMPT,
                    model=model,
                )
                return out
            else:
                # Raw call fallback
                out = client.post(
                    data={"inputs": PROMPT, "image": image_bytes},
                    model=model,
                )
                return out
        except AttributeError as e:
            print(f"    method {attempt} not available: {e}")
        except Exception as e:
            print(f"    {attempt} raised: {type(e).__name__}: {e}")
            raise


def main() -> None:
    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN required"

    OUT.parent.mkdir(parents=True, exist_ok=True)

    tries = [
        ("fal-ai",     "Wan-AI/Wan2.2-I2V-A14B"),
        ("fal-ai",     "Wan-AI/Wan2.1-I2V-14B-720P"),
        ("replicate",  "Wan-AI/Wan2.2-I2V-A14B"),
        ("replicate",  "Wan-AI/Wan2.1-I2V-14B-720P"),
    ]

    for provider, model in tries:
        try:
            video = try_provider(provider, model, token)
            if video:
                # video is raw bytes or Path
                if hasattr(video, "read"):
                    data = video.read()
                elif isinstance(video, (bytes, bytearray)):
                    data = video
                else:
                    with open(video, "rb") as f:
                        data = f.read()
                OUT.write_bytes(data)
                print(f"\n✓ Saved {OUT}  ({len(data)/1024/1024:.2f} MB)")
                return
        except Exception as e:
            print(f"  ✗ {provider}/{model}: {e}\n")

    print("\nAll providers failed — we'll need HF Pro or wait for ZeroGPU reset.")


if __name__ == "__main__":
    main()
