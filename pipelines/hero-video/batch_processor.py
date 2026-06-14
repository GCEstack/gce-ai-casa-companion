#!/usr/bin/env python3
"""
Batch hero-image-to-video pipeline.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from backends import get_backend
from video_stitcher import stitch_clips

load_dotenv()


DEFAULT_CONFIG: dict[str, Any] = {
    "backend": "pika_fal",
    "final_duration": 15,
    "clip_duration": 5,
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "concurrency": 3,
    "max_retries": 3,
    "seed": None,
    "transition": "fade",
    "transition_duration": 0.5,
    "cost_per_second": {
        "pika_fal": 0.05,
        "kling_fal": 0.06,
        "kling_segmind": 0.065,
        "kling_evolink": 0.075,
        "pika_pollo": 0.045,
    },
    "backends": {
        "pika_fal": {
            "model": "fal-ai/pika/v2.2/image-to-video",
            "env_key": "FAL_KEY",
            "max_duration": 10,
        },
        "kling_fal": {
            "model": "fal-ai/kling-video/v3/standard/image-to-video",
            "env_key": "FAL_KEY",
            "max_duration": 15,
        },
        "kling_segmind": {
            "endpoint": "https://api.segmind.com/v1/kling-image2video",
            "env_key": "SEGMIND_API_KEY",
            "auth_header": "x-api-key",
            "max_duration": 10,
            "field_mapping": {
                "image": "image",
                "prompt": "prompt",
                "negative_prompt": "negative_prompt",
                "duration": "duration",
                "aspect_ratio": "aspect_ratio",
                "cfg_scale": "cfg_scale",
                "mode": "mode",
            },
            "cfg_scale": 0.5,
            "mode": "std",
        },
        "kling_evolink": {
            "endpoint": "https://api.evolink.ai/v1/image-to-video",
            "env_key": "EVOLINK_API_KEY",
            "auth_header": "x-api-key",
            "max_duration": 10,
            "field_mapping": {
                "image": "image_url",
                "prompt": "prompt",
                "negative_prompt": "negative_prompt",
                "duration": "duration",
                "aspect_ratio": "aspect_ratio",
            },
        },
        "pika_pollo": {
            "base_url": "https://api.pollo.ai",
            "model_path": "generation/pika/pika-v2-2",
            "env_key": "POLLO_API_KEY",
            "max_duration": 10,
        },
    },
}


def load_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_config(path: Path | None) -> dict[str, Any]:
    config = DEFAULT_CONFIG.copy()
    if path and path.exists():
        user = load_json(path)
        config.update(user)
        # Deep-merge backends if user provided partial overrides.
        for key, val in user.get("backends", {}).items():
            config["backends"][key] = {**config["backends"].get(key, {}), **val}
    return config


def load_hero_prompts(path: Path) -> dict[str, Any]:
    data = load_json(path) if path.exists() else {}
    return {
        "default": data.get("default", DEFAULT_CONFIG),
        "heroes": data.get("heroes", {}),
    }


def discover_heroes(input_dir: Path, allowed: list[str] | None = None) -> list[Path]:
    exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    files = [p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in exts]
    files.sort()
    if allowed:
        allowed_lower = {a.lower() for a in allowed}
        files = [p for p in files if p.stem.lower() in allowed_lower]
    return files


def get_hero_config(name: str, prompts: dict[str, Any]) -> dict[str, Any]:
    heroes = prompts.get("heroes", {})
    default = prompts.get("default", {})
    return {**default, **heroes.get(name, heroes.get(name.lower(), {}))}


def estimate_cost(
    hero_count: int,
    clip_count: int,
    clip_duration: int,
    cost_per_second: float,
) -> float:
    return hero_count * clip_count * clip_duration * cost_per_second


def generate_clip_with_retry(
    backend: Any,
    image_path: Path,
    prompt: str,
    negative_prompt: str,
    duration: int,
    resolution: str,
    aspect_ratio: str,
    seed: int | None,
    output_path: Path,
    max_retries: int,
) -> Path:
    last_error = ""
    for attempt in range(1, max_retries + 1):
        try:
            print(f"  Generating {output_path.name} (attempt {attempt}/{max_retries})...")
            return backend.generate_clip(
                image_path=image_path,
                prompt=prompt,
                negative_prompt=negative_prompt,
                duration=duration,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                seed=seed,
                output_path=output_path,
            )
        except Exception as e:
            last_error = str(e)
            print(f"    [!] {output_path.name} failed attempt {attempt}: {last_error}")
            if attempt < max_retries:
                wait = 2 ** attempt
                print(f"    Retrying in {wait}s...")
                time.sleep(wait)
    raise RuntimeError(f"Failed after {max_retries} attempts: {last_error}")


def process_hero(
    image_path: Path,
    config: dict[str, Any],
    prompts: dict[str, Any],
    output_dir: Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    hero_name = image_path.stem
    hero_cfg = get_hero_config(hero_name, prompts)
    backend_key = config["backend"]
    backend = get_backend(config, backend_key)

    final_duration = int(config["final_duration"])
    clip_duration = min(int(config["clip_duration"]), backend.max_clip_duration())
    if clip_duration <= 0:
        clip_duration = 5

    clip_count = (final_duration + clip_duration - 1) // clip_duration
    clip_cost = backend.estimate_cost(clip_duration, config["resolution"])
    estimated_cost = round(clip_count * clip_cost, 4)

    report: dict[str, Any] = {
        "name": hero_name,
        "status": "pending",
        "clips": [],
        "final_video": None,
        "estimated_cost": estimated_cost,
        "actual_cost": estimated_cost,
        "error": None,
    }

    print(f"\n[hero] {hero_cfg.get('name', hero_name)}")
    print(f"   Prompt: {hero_cfg.get('motion_prompt', '')[:80]}...")
    print(f"   Generating {clip_count} clip(s) of ~{clip_duration}s each (est. ${estimated_cost:.2f})")

    if dry_run:
        report["status"] = "dry_run"
        return report

    clip_paths: list[Path] = []
    failed = False

    def job(idx: int) -> tuple[int, Path | Exception]:
        output_path = output_dir / f"{hero_name}_clip{idx + 1}.mp4"
        try:
            path = generate_clip_with_retry(
                backend,
                image_path,
                hero_cfg.get("motion_prompt", ""),
                hero_cfg.get("negative_prompt", ""),
                clip_duration,
                config["resolution"],
                config["aspect_ratio"],
                config.get("seed"),
                output_path,
                config.get("max_retries", 3),
            )
            return (idx, path)
        except Exception as e:
            return (idx, e)

    with ThreadPoolExecutor(max_workers=config.get("concurrency", 3)) as executor:
        futures = {executor.submit(job, i): i for i in range(clip_count)}
        for future in as_completed(futures):
            idx, result = future.result()
            if isinstance(result, Exception):
                failed = True
                print(f"   [FAIL] clip {idx + 1}: {result}")
                report["clips"].append({"index": idx + 1, "path": None, "error": str(result)})
            else:
                print(f"   [OK] clip {idx + 1}: {result.name}")
                clip_paths.append((idx, result))
                report["clips"].append({"index": idx + 1, "path": str(result), "error": None})

    clip_paths.sort(key=lambda x: x[0])

    if failed or not clip_paths:
        report["status"] = "failed"
        report["error"] = "One or more clips failed to generate"
        return report

    final_path = output_dir / f"{hero_name}_final.mp4"
    try:
        if len(clip_paths) == 1:
            from video_stitcher import loop_clip
            loop_clip(clip_paths[0][1], final_path, final_duration)
        else:
            stitch_clips(
                [p for _, p in clip_paths],
                final_path,
                transition=config.get("transition", "fade"),
                transition_duration=config.get("transition_duration", 0.5),
                target_duration=final_duration,
            )
        report["final_video"] = str(final_path)
        report["status"] = "completed"
        print(f"   [DONE] Final video: {final_path.name}")
    except Exception as e:
        report["status"] = "stitch_failed"
        report["error"] = f"Stitching failed: {e}"
        print(f"   [FAIL] Stitching failed: {e}")

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Casa Companion Hero Video Pipeline")
    parser.add_argument("--input-dir", required=True, type=Path, help="Folder containing hero images")
    parser.add_argument("--output-dir", type=Path, default=Path("./videos"), help="Output folder")
    parser.add_argument("--config", type=Path, default=Path("./config.json"), help="Config JSON path")
    parser.add_argument("--backend", help="Backend key (pika_fal, kling_segmind, etc.)")
    parser.add_argument("--final-duration", type=int, help="Target final video length in seconds")
    parser.add_argument("--clip-duration", type=int, help="Seconds per generated clip")
    parser.add_argument("--heroes", help="Comma-separated hero names to process")
    parser.add_argument("--resolution", help="720p or 1080p")
    parser.add_argument("--aspect-ratio", help="16:9, 9:16, 1:1")
    parser.add_argument("--concurrency", type=int, help="Max parallel clip generations")
    parser.add_argument("--max-retries", type=int, help="Retries per clip")
    parser.add_argument("--transition", help="FFmpeg xfade transition name")
    parser.add_argument("--transition-duration", type=float, help="Crossfade duration in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without generating")
    parser.add_argument("--keep-clips", action="store_true", help="Keep individual clip files (default)")
    parser.add_argument("--no-keep-clips", dest="keep_clips", action="store_false", help="Delete clips after stitching")
    parser.set_defaults(keep_clips=True)

    args = parser.parse_args(argv)

    if not args.dry_run:
        has_ffmpeg = bool(
            shutil.which("ffmpeg")
            or shutil.which("ffmpeg.exe")
            or (Path(__file__).parent / "ffmpeg" / "bin" / "ffmpeg.exe").exists()
            or (Path(__file__).parent / "ffmpeg" / "ffmpeg").exists()
        )
        if not has_ffmpeg:
            print("ERROR: ffmpeg not found. Install ffmpeg and add it to PATH, or place a build in ./ffmpeg.", file=sys.stderr)
            return 1

    config = load_config(args.config)
    # CLI overrides
    for key in [
        "backend",
        "final_duration",
        "clip_duration",
        "resolution",
        "aspect_ratio",
        "concurrency",
        "max_retries",
        "transition",
        "transition_duration",
    ]:
        val = getattr(args, key.replace("-", "_"))
        if val is not None:
            config[key] = val

    prompts_path = args.input_dir.parent / "hero_prompts.json"
    if not prompts_path.exists():
        prompts_path = Path("./hero_prompts.json")
    prompts = load_hero_prompts(prompts_path)

    allowed = [h.strip() for h in args.heroes.split(",")] if args.heroes else None
    hero_files = discover_heroes(args.input_dir, allowed)
    if not hero_files:
        print(f"No hero images found in {args.input_dir}")
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)

    backend = get_backend(config, config["backend"])
    clip_duration = min(int(config["clip_duration"]), backend.max_clip_duration())
    clip_count = (int(config["final_duration"]) + clip_duration - 1) // clip_duration
    total_cost = estimate_cost(
        len(hero_files),
        clip_count,
        clip_duration,
        config["cost_per_second"].get(config["backend"], 0.05),
    )

    print("=" * 60)
    print("Casa Companion Hero Video Pipeline")
    print("=" * 60)
    print(f"Backend:        {config['backend']}")
    print(f"Heroes:         {len(hero_files)}")
    print(f"Final duration: {config['final_duration']}s")
    print(f"Clip duration:  {clip_duration}s x {clip_count} clips")
    print(f"Resolution:     {config['resolution']}")
    print(f"Estimated cost: ${total_cost:.2f}")
    print("=" * 60)

    if args.dry_run:
        print("\nDRY RUN — no API calls will be made.")
        for f in hero_files:
            print(f"  {f.stem}: {clip_count} clip(s)")
        return 0

    started = datetime.now(timezone.utc).isoformat()
    reports: list[dict[str, Any]] = []

    for image_path in hero_files:
        report = process_hero(image_path, config, prompts, args.output_dir)
        reports.append(report)

    completed = datetime.now(timezone.utc).isoformat()
    final_cost = sum(r.get("actual_cost", 0) for r in reports)
    completed_count = sum(1 for r in reports if r["status"] == "completed")

    progress = {
        "started_at": started,
        "completed_at": completed,
        "config": {k: v for k, v in config.items() if k != "backends"},
        "total_estimated_cost": round(total_cost, 4),
        "total_actual_cost": round(final_cost, 4),
        "completed_heroes": completed_count,
        "failed_heroes": len(reports) - completed_count,
        "heroes": reports,
    }

    report_path = args.output_dir / "_progress_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2)

    print("\n" + "=" * 60)
    print(f"Done: {completed_count}/{len(reports)} heroes succeeded")
    print(f"Estimated cost: ${total_cost:.2f} | Actual: ${final_cost:.2f}")
    print(f"Report saved to: {report_path}")
    print("=" * 60)

    if not args.keep_clips:
        for r in reports:
            for c in r.get("clips", []):
                p = c.get("path")
                if p:
                    Path(p).unlink(missing_ok=True)
        print("Individual clips deleted (use --keep-clips to retain them).")

    return 0 if completed_count == len(reports) else 1


if __name__ == "__main__":
    sys.exit(main())
