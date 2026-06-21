"""Generate simple PWA icons for Casa Companion Mobile."""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow required: pip install Pillow")
    raise SystemExit(1)

OUT_DIR = Path(__file__).parent / "public" / "icons"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SIZES = [192, 512]
BG = "#0a0a0f"
ACCENT = "#d4a843"


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Circle background
    margin = size // 12
    draw.ellipse([margin, margin, size - margin, size - margin], fill=ACCENT, outline=None)

    # Text "CC"
    font_size = size // 2
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "CC"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2
    y = (size - text_h) // 2 - size // 20
    draw.text((x, y), text, font=font, fill="white")

    return img


def main() -> None:
    for size in SIZES:
        icon = make_icon(size)
        out_path = OUT_DIR / f"icon-{size}.png"
        icon.save(out_path, "PNG")
        print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
