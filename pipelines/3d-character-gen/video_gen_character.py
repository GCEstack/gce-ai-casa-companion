"""Generate a Casa Companion character idle or speaking clip via Wan 2.1 I2V.

Usage:
    python video_gen_character.py <character_slug> <variant> [options]

Variants:
    idle      - subtle breathing, blinking, ambient motion
    speaking  - mouth opening/closing, expressive talking motion

Examples:
    python video_gen_character.py tartaruga idle
    HF_TOKEN=xxx python video_gen_character.py pietro speaking --width 512 --height 512
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from gradio_client import Client, handle_file


DEFAULT_SPACE = "multimodalart/wan2-1-fast"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = PROJECT_ROOT / "static" / "images" / "heroes"
OUT_DIR = PROJECT_ROOT / "static" / "videos" / "v2"
PROMPTS_FILE = Path(__file__).with_suffix("").with_name("character_prompts_v2.json")

NEGATIVE_DEFAULT = (
    "blurry, distorted, extra limbs, deformed, text, watermark, low quality, "
    "morphing into different character, multiple characters, scary, aggressive, "
    "frozen still, no movement"
)


def load_prompts() -> dict:
    import json

    data: dict = {"heroes": {}}
    if PROMPTS_FILE.exists():
        with open(PROMPTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    return data


def get_prompt(slug: str, variant: str, prompts: dict) -> str:
    heroes = prompts.get("heroes", {})
    cfg = heroes.get(slug.lower()) or heroes.get(slug) or {}
    key = f"{variant}_prompt"
    prompt = cfg.get(key)
    if not prompt:
        base = cfg.get("motion_prompt", "")
        if variant == "speaking":
            prompt = f"{base}. The character is speaking - mouth opening and closing rhythmically as if talking to a child, expressive gentle facial expressions, slight head bobbing with each word, warm friendly demeanor, engaging and lively mood"
        else:
            prompt = f"{base}. Subtle calm motion, gentle breathing, soft blinks, alive and natural, cinematic lighting"
    return prompt


def find_mp4(result) -> str | None:
    if isinstance(result, str) and result.endswith(".mp4"):
        return result
    if isinstance(result, dict):
        for v in result.values():
            h = find_mp4(v)
            if h:
                return h
    if isinstance(result, (list, tuple)):
        for v in result:
            h = find_mp4(v)
            if h:
                return h
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate a Casa Companion character video clip")
    parser.add_argument("character", help="Character slug, e.g. tartaruga, pietro")
    parser.add_argument("variant", choices=["idle", "speaking"], help="Video variant to generate")
    parser.add_argument("--prompt", help="Override prompt")
    parser.add_argument("--negative", default=NEGATIVE_DEFAULT, help="Negative prompt")
    parser.add_argument("--space", default=DEFAULT_SPACE, help="Gradio space to use")
    parser.add_argument("--width", type=int, default=512, help="Output width")
    parser.add_argument("--height", type=int, default=512, help="Output height")
    parser.add_argument("--duration", type=int, default=4, help="Duration in seconds")
    parser.add_argument("--steps", type=int, default=4, help="Inference steps")
    parser.add_argument("--guidance", type=float, default=1.0, help="Guidance scale")
    parser.add_argument("--seed", type=int, default=0, help="Seed (0 = randomize)")
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR, help="Output directory")
    parser.add_argument("--src-dir", type=Path, default=SRC_DIR, help="Hero images directory")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without generating")

    args = parser.parse_args(argv)

    slug = args.character.lower()
    variant = args.variant

    prompts = load_prompts()
    prompt = args.prompt or get_prompt(slug, variant, prompts)

    src_candidates = [
        args.src_dir / f"{slug}.webp",
        args.src_dir / f"{slug}.png",
        args.src_dir / f"{slug}.jpg",
    ]
    src = next((p for p in src_candidates if p.exists()), None)
    if not src:
        print(f"ERROR: No source image found for '{slug}' in {args.src_dir}", file=sys.stderr)
        print(f"  Tried: {[str(p) for p in src_candidates]}", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out_path = args.out_dir / f"{slug}_{variant}.mp4"

    print(f"Character: {slug}")
    print(f"Variant:   {variant}")
    print(f"Source:    {src}")
    print(f"Output:    {out_path}")
    print(f"Prompt:    {prompt[:120]}...")

    if args.dry_run:
        print("DRY RUN — no API call made.")
        return 0

    token = os.getenv("HF_TOKEN")
    if not token:
        print("ERROR: HF_TOKEN environment variable required.", file=sys.stderr)
        print("Get one at https://huggingface.co/settings/tokens", file=sys.stderr)
        return 1

    print(f"Connecting to {args.space}...")
    client = Client(args.space, token=token)

    print(f"Submitting {slug} {variant} clip...")
    result = client.predict(
        input_image=handle_file(str(src)),
        prompt=prompt,
        height=args.height,
        width=args.width,
        negative_prompt=args.negative,
        duration_seconds=args.duration,
        guidance_scale=args.guidance,
        steps=args.steps,
        seed=args.seed,
        randomize_seed=(args.seed == 0),
        api_name="/generate_video",
    )

    mp4 = find_mp4(result)
    if not mp4:
        print(f"ERROR: No MP4 returned for {slug} {variant}", file=sys.stderr)
        return 1

    shutil.copy2(mp4, out_path)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nSaved: {out_path} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
