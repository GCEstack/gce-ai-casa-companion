"""Generate idle + speaking clips for all Phase 3 Roster_3 characters via Wan 2.1 I2V.

Reads HF_TOKEN from the consolidated secrets file so it does not need to be
passed on the command line.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

SECRETS_FILE = Path.home() / ".secrets" / "all-projects-secrets.env"
SRC_DIR = Path("../hero-video/heroes_phase3")
OUT_DIR = Path("../../static/videos/v2")
VARIANTS = ["idle", "speaking"]

CHARACTERS = [
    "agenda", "alien", "dragon_v2", "fraggl", "grouch", "jack_playful_v2",
    "lotso", "lotso_baby", "lotso_mobster", "lucha_bee", "mija",
    "ninja_cat", "papa", "pirate_parrot", "transformer_bot", "trex",
]


def load_hf_token() -> str:
    if "HF_TOKEN" in os.environ:
        return os.environ["HF_TOKEN"]
    if not SECRETS_FILE.exists():
        raise RuntimeError(f"{SECRETS_FILE} not found and HF_TOKEN not set")
    text = SECRETS_FILE.read_text(encoding="utf-8", errors="ignore")
    match = re.search(r"^HF_TOKEN=(.+)$", text, re.MULTILINE)
    if not match:
        raise RuntimeError("HF_TOKEN not found in secrets file")
    return match.group(1).strip()


def main() -> int:
    try:
        token = load_hf_token()
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    env["HF_TOKEN"] = token

    failures: list[tuple[str, str, int]] = []

    for character in CHARACTERS:
        for variant in VARIANTS:
            print("\n" + "=" * 50)
            print(f"Generating: {character} ({variant})")
            print("=" * 50)
            cmd = [
                sys.executable,
                "video_gen_character.py",
                character,
                variant,
                "--src-dir", str(SRC_DIR),
                "--out-dir", str(OUT_DIR),
                "--width", "512",
                "--height", "512",
                "--duration", "4",
            ]
            result = subprocess.run(cmd, env=env)
            if result.returncode != 0:
                failures.append((character, variant, result.returncode))

    print("\n" + "=" * 50)
    print("Phase 3 batch complete")
    print("=" * 50)
    if failures:
        print(f"Failures: {len(failures)}")
        for character, variant, code in failures:
            print(f"  {character} {variant}: exit code {code}")
        return 1
    print("All clips generated successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
