"""Generate character_prompts_v2.json from the hero-video prompts.

Creates separate idle and speaking prompts for every hero.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERO_PROMPTS = Path(__file__).resolve().parents[1] / "hero-video" / "hero_prompts.json"
OUT_FILE = Path(__file__).with_suffix("").with_name("character_prompts_v2.json")


def make_idle_prompt(base_motion: str, name: str) -> str:
    """Version 2 idle prompt: calm, breathing, blinking, alive."""
    base = base_motion.strip().rstrip(".")
    return (
        f"A soft cute plush {name} character, {base}. "
        "Subtle calm motion, gentle breathing, soft peaceful blinks, alive and natural. "
        "Warm cinematic lighting, soothing atmosphere, friendly and gentle. "
        "Loopable, no camera movement, centered character."
    )


def make_speaking_prompt(base_motion: str, name: str) -> str:
    """Version 2 speaking prompt: talking, expressive, mouth movement."""
    base = base_motion.strip().rstrip(".")
    return (
        f"A soft cute plush {name} character, {base}. "
        "The character is speaking directly to a child — mouth opening and closing rhythmically with each word, "
        "expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. "
        "Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character."
    )


def main() -> int:
    if not HERO_PROMPTS.exists():
        print(f"ERROR: {HERO_PROMPTS} not found", file=sys.stderr)
        return 1

    with open(HERO_PROMPTS, "r", encoding="utf-8") as f:
        data = json.load(f)

    heroes = data.get("heroes", {})
    v2: dict = {"_meta": {"note": "Version 2 idle/speaking prompts for Casa Companion characters"}, "heroes": {}}

    for slug, cfg in sorted(heroes.items()):
        name = cfg.get("name", slug.capitalize())
        motion = cfg.get("motion_prompt", "")
        if not motion:
            continue

        v2["heroes"][slug] = {
            "name": name,
            "category": cfg.get("category", "character"),
            "idle_prompt": make_idle_prompt(motion, name),
            "speaking_prompt": make_speaking_prompt(motion, name),
            "negative_prompt": cfg.get(
                "negative_prompt",
                "blurry, distorted, extra limbs, deformed, text, watermark, low quality, "
                "morphing into different character, multiple characters, scary, aggressive",
            ),
        }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(v2, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(v2['heroes'])} character prompt sets to {OUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
