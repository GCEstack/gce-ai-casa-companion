@echo off
REM Generate idle + speaking clips for all Phase 3 Roster_3 characters via Wan 2.1 I2V.
REM Requires: HF_TOKEN environment variable set.

if "%HF_TOKEN%"=="" (
  echo ERROR: HF_TOKEN is not set.
  echo Get one at https://huggingface.co/settings/tokens
  exit /b 1
)

set SRC_DIR=../hero-video/heroes_phase3
set OUT_DIR=../../static/videos/v2

set CHARACTERS=agenda alien dragon_v2 fraggl grouch jack_playful_v2 lotso lotso_baby lotso_mobster lucha_bee mija ninja_cat papa pirate_parrot transformer_bot trex
set VARIANTS=idle speaking

for %%c in (%CHARACTERS%) do (
  for %%v in (%VARIANTS%) do (
    echo.
    echo ================================
    echo Generating: %%c ^(%%v^)
    echo ================================
    python video_gen_character.py %%c %%v --src-dir %SRC_DIR% --out-dir %OUT_DIR% --width 512 --height 512 --duration 4
  )
)
