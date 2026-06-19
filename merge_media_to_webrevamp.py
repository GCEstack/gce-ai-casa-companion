"""Merge all Casa Companion images and videos into web-revamp/public/."""
from __future__ import annotations

import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path("C:/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion")
DEST_VIDEOS = ROOT / "web-revamp" / "public" / "videos"
DEST_HEROES = ROOT / "web-revamp" / "public" / "heroes"

VIDEO_EXTS = {".mp4", ".webm", ".mov"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

SKIP_DIRS = {"node_modules", ".git", "venv", ".venv", "dist", "build", "__pycache__"}


def find_files(exts: set[str]) -> dict[str, list[Path]]:
    by_name: dict[str, list[Path]] = defaultdict(list)
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() not in exts:
            continue
        # Skip already-merged destination files
        if DEST_VIDEOS in p.parents or DEST_HEROES in p.parents:
            continue
        by_name[p.name].append(p)
    return dict(by_name)


def copy_unique(files_by_name: dict[str, list[Path]], dest: Path, media_type: str) -> tuple[int, list[str]]:
    dest.mkdir(parents=True, exist_ok=True)
    copied = 0
    conflicts: list[str] = []

    for name, sources in sorted(files_by_name.items()):
        dest_path = dest / name
        if dest_path.exists():
            continue
        # Pick the largest file if multiple sources exist
        source = max(sources, key=lambda p: p.stat().st_size)
        if len(sources) > 1:
            conflicts.append(
                f"{name}: picked {source} ({source.stat().st_size} bytes); also found in "
                f"{', '.join(str(s) for s in sources if s != source)}"
            )
        shutil.copy2(source, dest_path)
        copied += 1

    return copied, conflicts


def main() -> int:
    print("Scanning for videos...")
    videos = find_files(VIDEO_EXTS)
    print(f"Found {len(videos)} unique video filenames across project")

    print("\nScanning for images...")
    images = find_files(IMAGE_EXTS)
    print(f"Found {len(images)} unique image filenames across project")

    print(f"\nCopying videos to {DEST_VIDEOS}...")
    copied_videos, video_conflicts = copy_unique(videos, DEST_VIDEOS, "video")
    print(f"Copied {copied_videos} new videos")

    print(f"\nCopying images to {DEST_HEROES}...")
    copied_images, image_conflicts = copy_unique(images, DEST_HEROES, "image")
    print(f"Copied {copied_images} new images")

    if video_conflicts:
        print(f"\nVideo conflicts (picked largest): {len(video_conflicts)}")
        for c in video_conflicts[:20]:
            print(f"  {c}")
        if len(video_conflicts) > 20:
            print(f"  ... and {len(video_conflicts) - 20} more")

    if image_conflicts:
        print(f"\nImage conflicts (picked largest): {len(image_conflicts)}")
        for c in image_conflicts[:20]:
            print(f"  {c}")
        if len(image_conflicts) > 20:
            print(f"  ... and {len(image_conflicts) - 20} more")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
