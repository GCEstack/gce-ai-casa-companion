"""
Local GroundingDINO + SAM pipeline.
Text prompt → box → per-concept transparent PNG mask.

Takes the Corvo hero art and extracts:
  body, left wing, right wing, head, beak, eye, tail, legs

Output:
  static/images/tv/corvo/layers/{concept}.png   — transparent PNG, same 1024x1024 canvas
  workspace/corvo_layers/_debug/annotated.png   — source with detected boxes drawn

CPU-only. First run will download ~1.1GB of model weights (cached under ~/.cache/huggingface).
Runtime after weights cached: ~60s for 7 concepts at 1024px.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import (
    AutoProcessor,
    AutoModelForZeroShotObjectDetection,
    SamModel,
    SamProcessor,
)

# --- Config ---
SRC = Path(r"C:\Claude\Personal\casa-companion\static\images\tv\corvo\_original\corvo_wings_spread.png")
OUT_LAYERS = Path(r"C:\Claude\Personal\casa-companion\static\images\tv\corvo\layers")
OUT_DEBUG = Path(r"C:\Claude\Personal\casa-companion\workspace\corvo_layers\_debug")

# Anchor points for a 1024x1024 wings_spread frame with Corvo centered.
# Left/right = viewer's perspective (image left vs image right).
POINTS = {
    "body_center":   (512, 600),
    "head_center":   (512, 300),
    "left_wing":     (220, 475),
    "right_wing":    (804, 475),
    "tail":          (512, 870),
    "legs":          (400, 860),
}

# Semantic concepts. Three modes:
#   ("text")                           → DINO → box → SAM
#   (("points": [...], "labels": [...]))  → SAM multi-point prompt
CONCEPTS = [
    ("body",       "body"),
    ("head",       "head"),
    ("beak",       "beak"),
    ("eye",        "eye"),
    ("legs",       "legs"),
    # Manual box + negative body/head point → SAM zeros in on just the wing region
    ("left_wing",  {
        "box": [40, 270, 440, 710],
        "negative": [POINTS["body_center"], POINTS["head_center"]],
    }),
    ("right_wing", {
        "box": [584, 270, 984, 710],
        "negative": [POINTS["body_center"], POINTS["head_center"]],
    }),
    ("tail",       {
        "positive": [POINTS["tail"]],
        "negative": [POINTS["body_center"], POINTS["left_wing"], POINTS["right_wing"], POINTS["legs"]],
    }),
]

DINO_ID = "IDEA-Research/grounding-dino-tiny"
SAM_ID = "facebook/sam-vit-base"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BOX_THRESHOLD = 0.20
TEXT_THRESHOLD = 0.15


def draw_annotations(image: Image.Image, detections: list) -> Image.Image:
    out = image.copy().convert("RGB")
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for concept, box, score in detections:
        x1, y1, x2, y2 = [int(v) for v in box]
        draw.rectangle([x1, y1, x2, y2], outline=(255, 120, 0), width=3)
        draw.text((x1 + 4, y1 + 4), f"{concept} {score:.2f}", fill=(255, 230, 200), font=font)
    return out


def main() -> None:
    assert SRC.exists(), f"Source image not found: {SRC}"
    OUT_LAYERS.mkdir(parents=True, exist_ok=True)
    OUT_DEBUG.mkdir(parents=True, exist_ok=True)

    print(f"Device: {DEVICE}")
    print(f"Loading {DINO_ID}...")
    dino_proc = AutoProcessor.from_pretrained(DINO_ID)
    dino = AutoModelForZeroShotObjectDetection.from_pretrained(DINO_ID).to(DEVICE)
    dino.eval()

    print(f"Loading {SAM_ID}...")
    sam_proc = SamProcessor.from_pretrained(SAM_ID)
    sam = SamModel.from_pretrained(SAM_ID).to(DEVICE)
    sam.eval()

    print(f"Loading image: {SRC}")
    image = Image.open(SRC).convert("RGB")
    # Upscale to a consistent working size so mask output has enough resolution
    work_size = 1024
    if max(image.size) < work_size:
        scale = work_size / max(image.size)
        new_size = (int(image.size[0] * scale), int(image.size[1] * scale))
        image = image.resize(new_size, Image.LANCZOS)
    print(f"Image size: {image.size}")

    image_np = np.array(image)
    detections = []

    def run_sam(sam_kwargs: dict):
        sam_inputs = sam_proc(image, **sam_kwargs, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            sam_out = sam(**sam_inputs)
        masks = sam_proc.image_processor.post_process_masks(
            sam_out.pred_masks.cpu(),
            sam_inputs["original_sizes"].cpu(),
            sam_inputs["reshaped_input_sizes"].cpu(),
        )
        mask_tensor = masks[0]  # (num_prompts, num_masks_per, H, W)
        iou_scores = sam_out.iou_scores[0, 0].cpu().numpy()
        best_mask_idx = int(np.argmax(iou_scores))
        return mask_tensor[0, best_mask_idx].numpy().astype(np.uint8) * 255

    for out_name, prompt in CONCEPTS:
        # Manual box / multi-point prompt path
        if isinstance(prompt, dict):
            kwargs = {}
            if "box" in prompt:
                kwargs["input_boxes"] = [[prompt["box"]]]
            pos = prompt.get("positive", [])
            neg = prompt.get("negative", [])
            points = list(pos) + list(neg)
            if points:
                labels = [1] * len(pos) + [0] * len(neg)
                kwargs["input_points"] = [[list(p) for p in points]]
                kwargs["input_labels"] = [labels]
            desc_parts = []
            if "box" in prompt:
                desc_parts.append(f"box={prompt['box']}")
            if pos:
                desc_parts.append(f"+{len(pos)}")
            if neg:
                desc_parts.append(f"-{len(neg)}")
            print(f"  · {out_name:12s} {' '.join(desc_parts)}")
            mask = run_sam(kwargs)
            box_for_debug = prompt.get("box", [pos[0][0] - 30, pos[0][1] - 30,
                                                 pos[0][0] + 30, pos[0][1] + 30] if pos else [0, 0, 10, 10])
            detections.append((out_name, box_for_debug, 1.0))

        # Text prompt path — DINO → box → SAM
        else:
            query = prompt + "."
            dino_inputs = dino_proc(images=image, text=query, return_tensors="pt").to(DEVICE)
            with torch.no_grad():
                dino_out = dino(**dino_inputs)
            results = dino_proc.post_process_grounded_object_detection(
                dino_out,
                dino_inputs.input_ids,
                threshold=BOX_THRESHOLD,
                text_threshold=TEXT_THRESHOLD,
                target_sizes=[image.size[::-1]],
            )[0]
            if len(results["boxes"]) == 0:
                print(f"  ✗ {out_name:12s} — no detection")
                continue
            scores = results["scores"].tolist()
            best = int(np.argmax(scores))
            box = results["boxes"][best].tolist()
            score = scores[best]
            print(f"  ✓ {out_name:12s} score={score:.2f}  box={[int(v) for v in box]}")
            detections.append((out_name, box, score))
            mask = run_sam({"input_boxes": [[box]]})

        rgba = np.dstack([image_np, mask])
        out_path = OUT_LAYERS / f"{out_name}.png"
        Image.fromarray(rgba).save(out_path)

    # Debug annotated image
    annotated = draw_annotations(image, detections)
    annotated.save(OUT_DEBUG / "annotated.png")

    print()
    print(f"Layers saved to: {OUT_LAYERS}")
    print(f"Debug annotated image: {OUT_DEBUG / 'annotated.png'}")
    print(f"Hit rate: {len(detections)}/{len(CONCEPTS)} concepts detected")


if __name__ == "__main__":
    main()
