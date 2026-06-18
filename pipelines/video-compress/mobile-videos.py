"""Compress Casa Companion character videos for mobile.

Usage:
    python mobile-videos.py [--src-dir PATH] [--out-dir PATH] [--width 480] [--bitrate 800k]

Requires ffmpeg on PATH.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = PROJECT_ROOT / "web-revamp" / "public" / "videos"
DEFAULT_OUT = PROJECT_ROOT / "web-mobile" / "public" / "videos"


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if not exe:
        raise RuntimeError("ffmpeg not found on PATH")
    return exe


def get_video_duration(path: Path) -> float:
    ffprobe = shutil.which("ffprobe") or shutil.which("ffprobe.exe")
    if not ffprobe:
        return 0.0
    cmd = [
        ffprobe,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def compress(input_path: Path, output_path: Path, width: int, bitrate: str, ffmpeg: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-i", str(input_path),
        "-vf", f"scale='min({width},iw)':-2",
        "-c:v", "libx264",
        "-profile:v", "baseline",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-b:v", bitrate,
        "-maxrate", bitrate,
        "-bufsize", "2M",
        "-movflags", "+faststart",
        "-an",  # no audio
        str(output_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compress Casa Companion videos for mobile")
    parser.add_argument("--src-dir", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--width", type=int, default=480, help="Max width in pixels")
    parser.add_argument("--bitrate", default="800k", help="Target video bitrate")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    ffmpeg = find_ffmpeg()
    src_dir: Path = args.src_dir
    out_dir: Path = args.out_dir

    if not src_dir.exists():
        print(f"ERROR: source directory not found: {src_dir}", file=sys.stderr)
        return 1

    files = sorted([p for p in src_dir.iterdir() if p.suffix.lower() == ".mp4"])
    if not files:
        print(f"No MP4 files found in {src_dir}")
        return 0

    total_in = sum(p.stat().st_size for p in files)
    print(f"Found {len(files)} videos in {src_dir}")
    print(f"Total input size: {total_in / (1024*1024):.1f} MB")
    print(f"Output directory: {out_dir}")
    print(f"Settings: width={args.width}, bitrate={args.bitrate}")

    if args.dry_run:
        for f in files:
            print(f"  Would compress: {f.name}")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    results: list[tuple[Path, Path, float]] = []

    for idx, input_path in enumerate(files, 1):
        output_path = out_dir / input_path.name
        try:
            duration = get_video_duration(input_path)
            print(f"[{idx}/{len(files)}] Compressing {input_path.name} ({duration:.1f}s)...")
            compress(input_path, output_path, args.width, args.bitrate, ffmpeg)
            ratio = output_path.stat().st_size / input_path.stat().st_size
            print(f"       Done: {input_path.stat().st_size/1024/1024:.2f} MB -> {output_path.stat().st_size/1024/1024:.2f} MB ({ratio:.0%})")
            results.append((input_path, output_path, ratio))
        except subprocess.CalledProcessError as e:
            print(f"       FAILED: {input_path.name}", file=sys.stderr)
            print(f"       {e.stderr.decode('utf-8', errors='ignore')[:200]}", file=sys.stderr)

    total_out = sum(p.stat().st_size for _, p, _ in results)
    print("\n" + "=" * 60)
    print(f"Compressed {len(results)}/{len(files)} videos")
    print(f"Total: {total_in / (1024*1024):.1f} MB -> {total_out / (1024*1024):.1f} MB ({total_out/total_in:.0%})")
    print("=" * 60)

    return 0 if len(results) == len(files) else 1


if __name__ == "__main__":
    sys.exit(main())
