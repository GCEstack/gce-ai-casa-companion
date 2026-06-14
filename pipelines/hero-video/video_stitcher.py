#!/usr/bin/env python3
"""
Standalone FFmpeg-based video stitcher.
Can be imported or run from the command line.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if not exe:
        # Check for a bundled ffmpeg next to the script (e.g. ./ffmpeg/bin/ffmpeg.exe)
        bundled = Path(__file__).parent / "ffmpeg" / "bin" / "ffmpeg.exe"
        if bundled.exists():
            return str(bundled)
        bundled_posix = Path(__file__).parent / "ffmpeg" / "ffmpeg"
        if bundled_posix.exists():
            return str(bundled_posix)
        raise RuntimeError(
            "ffmpeg not found. Install it and make sure it's on your PATH, "
            "or place a ffmpeg build in ./ffmpeg.\n"
            "Windows: choco install ffmpeg\n"
            "macOS: brew install ffmpeg\n"
            "Linux: sudo apt install ffmpeg"
        )
    return exe


def ffprobe_duration(path: Path, exe: str | None = None) -> float:
    probe = exe or shutil.which("ffprobe") or shutil.which("ffprobe.exe")
    if not probe:
        bundled = Path(__file__).parent / "ffmpeg" / "bin" / "ffprobe.exe"
        if bundled.exists():
            probe = str(bundled)
        else:
            bundled_posix = Path(__file__).parent / "ffmpeg" / "ffprobe"
            if bundled_posix.exists():
                probe = str(bundled_posix)
    if not probe:
        raise RuntimeError("ffprobe not found (install ffmpeg)")
    cmd = [
        probe,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def loop_clip(input_clip: Path, output: Path, target_duration: float, exe: str | None = None) -> Path:
    ffmpeg = exe or find_ffmpeg()
    cmd = [
        ffmpeg,
        "-stream_loop", "-1",
        "-i", str(input_clip),
        "-t", str(target_duration),
        "-c", "copy",
        "-movflags", "+faststart",
        "-y",
        str(output),
    ]
    subprocess.run(cmd, check=True)
    return output


def stitch_clips(
    clips: Iterable[Path],
    output: Path,
    transition: str = "fade",
    transition_duration: float = 0.5,
    target_duration: float | None = None,
    ffmpeg_exe: str | None = None,
) -> Path:
    """
    Stitch multiple clips with FFmpeg xfade transitions.

    Parameters
    ----------
    clips:
        Ordered list of clip paths.
    transition:
        xfade transition name (fade, wipeleft, wiperight, slideleft, etc.).
    transition_duration:
        Crossfade length in seconds.
    target_duration:
        If provided, the final output is trimmed/looped to this length.
    """
    clip_list = [Path(c) for c in clips]
    if not clip_list:
        raise ValueError("No clips provided")

    ffmpeg = ffmpeg_exe or find_ffmpeg()

    if len(clip_list) == 1:
        final = loop_clip(clip_list[0], output, target_duration or ffprobe_duration(clip_list[0]), ffmpeg)
        return final

    durations = [ffprobe_duration(c) for c in clip_list]

    inputs = []
    for c in clip_list:
        inputs.extend(["-i", str(c)])

    # Build chained xfade filter graph.
    # offset_n = sum(durations[:n+1]) - (n+1)*transition_duration
    filters: list[str] = []
    prev_label = "0:v"
    current_offset = durations[0] - transition_duration
    for idx in range(1, len(clip_list)):
        out_label = f"v{idx}" if idx < len(clip_list) - 1 else "vout"
        filters.append(
            f"[{prev_label}][{idx}:v]xfade=transition={transition}:duration={transition_duration}:offset={current_offset}[{out_label}]"
        )
        prev_label = out_label
        if idx < len(clip_list) - 1:
            current_offset += durations[idx] - transition_duration

    filter_complex = ";".join(filters)

    expected_duration = sum(durations) - (len(clip_list) - 1) * transition_duration

    cmd = [
        ffmpeg,
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]",
    ]

    cmd.append("-an")

    cmd.extend([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-y",
        str(output),
    ])

    subprocess.run(cmd, check=True)

    if target_duration:
        actual = ffprobe_duration(output)
        if abs(actual - target_duration) > 0.5:
            # Trim or loop to exact target.
            temp = output.with_suffix(".temp" + output.suffix)
            if actual > target_duration:
                trim_cmd = [
                    ffmpeg, "-i", str(output), "-t", str(target_duration),
                    "-c", "copy", "-y", str(temp)
                ]
            else:
                trim_cmd = [
                    ffmpeg, "-stream_loop", "-1", "-i", str(output),
                    "-t", str(target_duration), "-c", "copy", "-y", str(temp)
                ]
            subprocess.run(trim_cmd, check=True)
            temp.replace(output)

    print(f"[stitch] Created {output} (expected {expected_duration:.1f}s)")
    return output


def batch_stitch(input_dir: Path, target_duration: float, transition: str, transition_duration: float) -> list[Path]:
    """Find *_clip*.mp4 groups and stitch each hero."""
    clips_by_hero: dict[str, list[Path]] = {}
    pattern = re.compile(r"^(.*?)_clip\d+\.mp4$", re.IGNORECASE)
    for f in sorted(input_dir.iterdir()):
        if not f.is_file():
            continue
        m = pattern.match(f.name)
        if m:
            clips_by_hero.setdefault(m.group(1), []).append(f)

    results: list[Path] = []
    for hero, clips in sorted(clips_by_hero.items()):
        if len(clips) < 1:
            continue
        clips.sort(key=lambda p: p.name)
        out = input_dir / f"{hero}_final.mp4"
        print(f"[stitch] Stitching {hero} from {len(clips)} clips...")
        stitch_clips(clips, out, transition, transition_duration, target_duration)
        results.append(out)
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Stitch AI-generated clips into longer hero videos")
    sub = parser.add_subparsers(dest="command", required=True)

    stitch = sub.add_parser("stitch", help="Stitch specific clips")
    stitch.add_argument("--clips", nargs="+", required=True, type=Path, help="Ordered clip paths")
    stitch.add_argument("--output", required=True, type=Path)
    stitch.add_argument("--transition", default="fade", help="xfade transition name")
    stitch.add_argument("--transition-duration", type=float, default=0.5)
    stitch.add_argument("--target-duration", type=float, default=None)

    loop = sub.add_parser("loop", help="Loop a single clip to a target duration")
    loop.add_argument("--clip", required=True, type=Path)
    loop.add_argument("--target-duration", required=True, type=float)
    loop.add_argument("--output", required=True, type=Path)

    batch = sub.add_parser("batch", help="Batch stitch hero clips in a directory")
    batch.add_argument("--input-dir", required=True, type=Path)
    batch.add_argument("--target-duration", type=float, default=15)
    batch.add_argument("--transition", default="fade")
    batch.add_argument("--transition-duration", type=float, default=0.5)

    args = parser.parse_args(argv)

    try:
        if args.command == "stitch":
            stitch_clips(
                args.clips,
                args.output,
                args.transition,
                args.transition_duration,
                args.target_duration,
            )
        elif args.command == "loop":
            loop_clip(args.clip, args.output, args.target_duration)
        elif args.command == "batch":
            batch_stitch(args.input_dir, args.target_duration, args.transition, args.transition_duration)
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg failed: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
