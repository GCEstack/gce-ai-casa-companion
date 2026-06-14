# Casa Companion Hero Video Pipeline

Transform a folder of static hero images into 15–30 second animated videos with real AI-generated motion — wings that flap, hands that gesture, mouths that open. No parallax slide tricks.

## What This Solves

| Problem | Previous Approach | This Solution |
|---|---|---|
| Images only "slide" | Depth parallax (pixels remap) | AI generates new motion frames |
| No real animation | Camera drift across static image | Characters actually move |
| 34 heroes to process | Manual one-by-one | Fully automated batch pipeline |
| 15–30 second target | Single 5s clip | Intelligent clip stitching with crossfade |
| Cost uncertainty | No tracking | Per-hero cost estimation & reporting |

## Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install FFmpeg (required for video stitching)
# Windows: choco install ffmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg
```

### 2. Get an API Key

**Recommended: fal.ai (Pika v2.2)** — best for cartoon/illustration style.

1. Go to [fal.ai](https://fal.ai) and create an account.
2. Navigate to your dashboard → API Keys.
3. Copy your key.

Alternative providers:

| Service | Best For | Approx. Price |
|---|---|---|
| fal.ai (Pika) | Cartoon/illustration motion | ~$0.05/s |
| fal.ai (Kling) | Realistic/cinematic motion | ~$0.06/s |
| Segmind (Kling) | Cheaper Kling alternative | ~$0.065/s |
| EvoLink (Kling) | High-quality Kling | ~$0.075/s |
| Pollo (Pika) | Platform access | ~$0.045/s |

### 3. Set API Key

```bash
# Windows Command Prompt
set FAL_KEY=your_key_here

# Windows PowerShell
$env:FAL_KEY="your_key_here"

# macOS/Linux
export FAL_KEY=your_key_here
```

For other backends set the matching env var:
- `SEGMIND_API_KEY`
- `EVOLINK_API_KEY`
- `POLLO_API_KEY`

### 4. Prepare Your Heroes

Copy your hero images to a folder. The script auto-discovers:

```
heroes/
  battito.webp
  bear.webp
  bunny.webp
  crow.webp
  dragon.webp
  dolphin.webp
  elephant.webp
  ...
```

### 5. Run

```bash
# Dry run first (see what would happen, no API calls)
python batch_processor.py --input-dir ./heroes --dry-run

# Process all heroes into 15-second videos
python batch_processor.py --input-dir ./heroes --output-dir ./videos --backend pika_fal

# Generate 30-second videos
python batch_processor.py --input-dir ./heroes --output-dir ./videos --backend pika_fal --final-duration 30

# Process only specific heroes
python batch_processor.py --input-dir ./heroes --output-dir ./videos --heroes crow,dragon,phoenix

# Use a different backend
python batch_processor.py --input-dir ./heroes --output-dir ./videos --backend kling_segmind
```

## How It Works

```
Hero Images
    |
    v
[Motion Prompt Lookup]  ← hero_prompts.json
    |
    v
[API Batch Generator]   ← Pika/Kling I2V
  - configurable clip length & count
  - concurrent generation
  - auto-retry on failure
    |
    v
[Video Stitcher]        ← FFmpeg xfade
  - merges clips → final length
  - seamless transitions
    |
    v
Animated Videos (MP4) + _progress_report.json
```

## Project Files

| File | Purpose |
|---|---|
| `batch_processor.py` | Main batch processing script |
| `video_stitcher.py` | Standalone FFmpeg stitching utility |
| `backends.py` | Backend adapters (fal, Segmind, Pollo, generic HTTP) |
| `hero_prompts.json` | Per-character motion prompts |
| `config.example.json` | Configuration template |
| `requirements.txt` | Python dependencies |

## Configuration

Copy the example config and edit it:

```bash
cp config.example.json config.json
```

Key settings:

```json
{
  "backend": "pika_fal",
  "final_duration": 15,
  "clip_duration": 5,
  "resolution": "720p",
  "aspect_ratio": "16:9",
  "concurrency": 3,
  "max_retries": 3
}
```

Most settings can also be overridden on the command line (see `--help`).

## Customizing Motion Prompts

Edit `hero_prompts.json` to customize animation for each hero:

```json
{
  "heroes": {
    "crow": {
      "name": "Crow",
      "category": "bird",
      "motion_prompt": "mystical black crow flapping wings slowly up and down...",
      "negative_prompt": "wings clipped, no wing movement, blurry feathers",
      "duration": 5,
      "motion_strength": 4
    }
  }
}
```

If a hero is missing, the pipeline falls back to the `default` prompt.

### Motion Strength Guide

| Strength | Motion |
|---|---|
| 1 | Very subtle (breathing, blinking) |
| 2 | Gentle (slow head turn, ear twitch) |
| 3 | Moderate (wing flap, tail wag) |
| 4 | Active (running, jumping, roaring) |
| 5 | Intense (fire breathing, dramatic action) |

## Output Structure

```
videos/
  battito_final.mp4
  bear_final.mp4
  crow_final.mp4
  crow_clip1.mp4
  crow_clip2.mp4
  crow_clip3.mp4
  ...
  _progress_report.json
```

## Cost Estimation

For 34 heroes × 15 seconds (3 clips × 5s):

| Backend | Cost/Second | Total Estimate |
|---|---|---|
| Pika (fal.ai) | $0.05 | ~$25.50 |
| Pika (pollo.ai) | $0.045 | ~$22.95 |
| Kling (fal.ai) | $0.06 | ~$30.60 |
| Kling (Segmind) | $0.065 | ~$33.15 |
| Kling (EvoLink) | $0.075 | ~$38.25 |

Money-saving tips:

- Start with `--heroes crow,bear,bunny` to test.
- Use `--dry-run` to verify setup before spending.
- Start with `720p` and lower `motion_strength` for cheaper, faster generations.

## Video Stitcher (Standalone)

Already have clips? Use the standalone stitcher:

```bash
# Stitch specific clips
python video_stitcher.py stitch \
  --clips crow_clip1.mp4 crow_clip2.mp4 crow_clip3.mp4 \
  --output crow_final.mp4

# Loop a single clip to 15 seconds
python video_stitcher.py loop \
  --clip crow_clip1.mp4 \
  --target-duration 15 \
  --output crow_looped.mp4

# Batch stitch all hero clips in a directory
python video_stitcher.py batch \
  --input-dir ./videos \
  --target-duration 15

# Different transition styles
python video_stitcher.py stitch \
  --clips a.mp4 b.mp4 c.mp4 \
  --transition wipeleft \
  --output out.mp4
```

Supported transitions are any name FFmpeg `xfade` supports: `fade`, `wipeleft`, `wiperight`, `slideleft`, `slideright`, `distance`, `fadeblack`, etc.

## Backend Notes

- **fal.ai backends** (`pika_fal`, `kling_fal`) are the most tested. They upload local images automatically to fal CDN.
- **Segmind/EvoLink** require the image to be reachable via a public URL. The pipeline will attempt to upload via a temporary public host if you don't have `FAL_KEY` set; for production, host images yourself or use fal.ai.
- **Pollo** uses Pollo's `/file/sign` upload flow and async task polling.

## Troubleshooting

### API Key Issues

```
Missing API key. Set the FAL_KEY environment variable.
```

Fix: set your key (see step 3).

### FFmpeg Not Found

```
ffmpeg not found
```

Fix: install FFmpeg and add it to PATH.

### Generation Fails / Timeout

The script retries each clip up to `--max-retries` times. If a hero consistently fails:

- Check your API credits/balance.
- Try a different backend: `--backend kling_segmind`.
- Process individually: `--heroes bear`.

### Module Import Error

```
No module named 'fal_client'
```

Fix: `pip install -r requirements.txt`

## License

Built for Casa Companion. Free to use and modify.
