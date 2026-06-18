"""Batch runner for a single AgentSwarm worker.

Generates idle + speaking v2 videos for a comma-separated list of character slugs.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
GEN_SCRIPT = Path(__file__).with_name("video_gen_character.py")


def run_one(slug: str, variant: str) -> bool:
    cmd = [
        sys.executable,
        str(GEN_SCRIPT),
        slug,
        variant,
        "--width", "512",
        "--height", "512",
        "--duration", "4",
        "--steps", "4",
    ]
    print(f"\n{'='*60}")
    print(f"Running: {' '.join(cmd)}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)
    return result.returncode == 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate v2 videos for a batch of characters")
    parser.add_argument("characters", help="Comma-separated character slugs, e.g. bear,bunny,crow")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without generating")
    args = parser.parse_args(argv)

    token = os.getenv("HF_TOKEN")
    if not token and not args.dry_run:
        print("ERROR: HF_TOKEN environment variable required.", file=sys.stderr)
        return 1

    slugs = [s.strip().lower() for s in args.characters.split(",") if s.strip()]
    if not slugs:
        print("ERROR: No characters provided", file=sys.stderr)
        return 1

    print(f"Batch: {slugs}")
    print(f"Output: {PROJECT_ROOT / 'static' / 'videos' / 'v2'}")

    if args.dry_run:
        print("DRY RUN — would generate:")
        for slug in slugs:
            print(f"  - {slug} idle")
            print(f"  - {slug} speaking")
        return 0

    results: list[tuple[str, str, bool]] = []
    for slug in slugs:
        ok_idle = run_one(slug, "idle")
        results.append((slug, "idle", ok_idle))
        ok_speaking = run_one(slug, "speaking")
        results.append((slug, "speaking", ok_speaking))

    print(f"\n{'='*60}")
    print("Batch complete")
    print(f"{'='*60}")
    failed = [(s, v) for s, v, ok in results if not ok]
    for slug, variant, ok in results:
        status = "OK" if ok else "FAIL"
        print(f"  [{status}] {slug} {variant}")

    if failed:
        print(f"\nFailed: {failed}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
