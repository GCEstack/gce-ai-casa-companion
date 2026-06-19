#!/usr/bin/env python3
"""Inventory Casa Companion hero images vs generated videos."""
from __future__ import annotations

import json
from pathlib import Path
from collections import defaultdict

ROOT = Path("C:/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion")

PHASES = {
    "Phase 1 - Core Heroes": ROOT / "static" / "images" / "heroes",
    "Phase 2 - Batch2 Scenes": ROOT / "casa-companion-site" / "images" / "batch2",
    "Phase 3 - Roster_3": ROOT / "Roster_3",
}

VIDEO_DIRS = {
    "static/videos/v2": ROOT / "static" / "videos" / "v2",
    "web-mobile/public/videos": ROOT / "web-mobile" / "public" / "videos",
    "web-next/public/videos": ROOT / "web-next" / "public" / "videos",
    "web-revamp/public/videos": ROOT / "web-revamp" / "public" / "videos",
    "Roster_3": ROOT / "Roster_3",
    "tv-companion/static/videos": ROOT / "tv-companion" / "static" / "videos",
}

# Map video stems / source stems to a canonical hero key.
NORMALIZE = {
    "tartaruga": "turtle",
    "corvo": "crow",
    "coniglio": "bunny",
    "delfino": "dolphin",
    "drago": "dragon",
    "elefante": "elephant",
    "gufo": "owl",
    "leone": "lion",
    "orsetto": "bear",
    "polpo": "octopus",
    "volpe": "fox",
    "jack": "jack_playful_v2",
    "jack_playful": "jack_playful_v2",
}

STRIP_VIDEO_SUFFIXES = ["_final", "_idle", "_speaking", "_clip1", "_clip2", "_clip3", "_v2", "_portrait"]


def normalize_name(name: str) -> str:
    name = name.lower()
    if name.endswith("_portrait"):
        name = name[:-len("_portrait")]
    return NORMALIZE.get(name, name)


def collect_videos() -> dict[str, list[str]]:
    by_name: dict[str, list[str]] = defaultdict(list)
    for label, d in VIDEO_DIRS.items():
        if not d.exists():
            continue
        for p in d.iterdir():
            if p.is_file() and p.suffix.lower() in {".mp4", ".webm", ".mov"}:
                stem = p.stem
                for suffix in STRIP_VIDEO_SUFFIXES:
                    if stem.endswith(suffix):
                        stem = stem[:-len(suffix)]
                key = normalize_name(stem)
                by_name[key].append(f"{label}/{p.name}")
    return dict(by_name)


def collect_images() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for phase, d in PHASES.items():
        if not d.exists():
            result[phase] = {}
            continue
        images: dict[str, str] = {}
        for p in d.iterdir():
            if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
                key = normalize_name(p.stem)
                images[key] = p.name
        result[phase] = images
    return result


def main() -> None:
    images_by_phase = collect_images()
    videos = collect_videos()

    print("=" * 80)
    print("Casa Companion Video Generation Inventory")
    print("=" * 80)

    report: dict[str, Any] = {"phases": {}}
    for phase, heroes in images_by_phase.items():
        print(f"\n{phase}")
        print("-" * 80)
        print(f"Total source images: {len(heroes)}")
        missing = sorted([name for key, name in sorted(heroes.items()) if key not in videos])
        present = sorted([name for key, name in sorted(heroes.items()) if key in videos])
        print(f"  Have any video: {len(present)}")
        print(f"  Missing video:  {len(missing)}")
        if missing:
            print(f"  Missing: {', '.join(missing[:40])}{'...' if len(missing) > 40 else ''}")
        if present:
            print(f"  Present: {', '.join(present[:40])}{'...' if len(present) > 40 else ''}")
        report["phases"][phase] = {
            "source_images": heroes,
            "missing_videos": missing,
            "present_videos": present,
        }

    # Orphan videos (videos not matching any known source)
    image_keys = set()
    for heroes in images_by_phase.values():
        image_keys.update(heroes.keys())
    orphan_videos = {k: v for k, v in sorted(videos.items()) if k not in image_keys}

    print("\n" + "=" * 80)
    print("Videos not matched to any known source image")
    print("-" * 80)
    if orphan_videos:
        for name, paths in orphan_videos.items():
            print(f"  {name}: {', '.join(paths[:3])}")
    else:
        print("  None")
    report["orphan_videos"] = orphan_videos

    out_path = ROOT / "pipelines" / "hero-video" / "_inventory_report.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nDetailed report saved to: {out_path}")


if __name__ == "__main__":
    from typing import Any
    main()
