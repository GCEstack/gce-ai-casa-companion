: Windows batch file to generate 15s hero videos for Phase 3 Roster_3 characters.
: Requires: FAL_KEY environment variable set, and ffmpeg in PATH.
: Usage: run_phase3.bat

@echo off
if "%FAL_KEY%"=="" (
  echo ERROR: FAL_KEY is not set.
  echo Get a key at https://fal.ai/dashboard/keys
  exit /b 1
)

python batch_processor.py ^
  --input-dir ./heroes_phase3 ^
  --output-dir ./videos_phase3 ^
  --config ./config_phase3.json ^
  --backend pika_fal
