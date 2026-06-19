#!/usr/bin/env bash
# Generate idle + speaking clips for all Phase 3 Roster_3 characters via Wan 2.1 I2V.
# Requires: HF_TOKEN environment variable set.
# Usage: bash run_phase3.sh

set -euo pipefail

SRC_DIR="../hero-video/heroes_phase3"
OUT_DIR="../../static/videos/v2"
VARIANTS=("idle" "speaking")

CHARACTERS=(
  agenda alien dragon_v2 fraggl grouch jack_playful_v2
  lotso lotso_baby lotso_mobster lucha_bee mija
  ninja_cat papa pirate_parrot transformer_bot trex
)

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "ERROR: HF_TOKEN is not set." >&2
  echo "Get one at https://huggingface.co/settings/tokens" >&2
  exit 1
fi

for character in "${CHARACTERS[@]}"; do
  for variant in "${VARIANTS[@]}"; do
    echo "================================"
    echo "Generating: $character ($variant)"
    echo "================================"
    python video_gen_character.py "$character" "$variant" \
      --src-dir "$SRC_DIR" \
      --out-dir "$OUT_DIR" \
      --width 512 \
      --height 512 \
      --duration 4
  done
done
