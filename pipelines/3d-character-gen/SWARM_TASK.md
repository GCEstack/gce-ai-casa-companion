# Casa Companion v2 Character Video Agent Swarm

Generates version 2 idle + speaking videos for every Casa Companion character using Wan 2.1 I2V on Hugging Face.

## Prerequisites

```powershell
# Windows
$env:HF_TOKEN = "hf_..."

# macOS / Linux
export HF_TOKEN="hf_..."
```

Get a token at https://huggingface.co/settings/tokens

## Files

- `video_gen_character.py` — single-character/variant generator
- `run_batch.py` — batch runner for one AgentSwarm worker
- `character_prompts_v2.json` — idle + speaking prompts for 36 heroes
- `generate_v2_prompts.py` — regenerates `character_prompts_v2.json` from `hero_prompts.json`

## Output

Videos are written to:

```
casa-companion-master/static/videos/v2/<slug>_idle.mp4
casa-companion-master/static/videos/v2/<slug>_speaking.mp4
```

## Agent Swarm Batches

| Worker | Characters |
|--------|------------|
| 1 | battito, bear, bunny, crow |
| 2 | dragon, dolphin, elephant, fox |
| 3 | phoenix, wolf, bella, borsa |
| 4 | costruttore, cucita, cuoco, dottore |
| 5 | forza, lion, maestra, mamma |
| 6 | nonna, octopus, onda, owl |
| 7 | pietro, ragno, rocco, sacco |
| 8 | scheletro, spugna, stellino, turtle |
| 9 | veloce, verita, vinile, xolo |

Each worker runs `run_batch.py <characters>` which generates idle + speaking clips for its assigned slugs.

## Manual single batch

```bash
cd casa-companion-master/pipelines/3d-character-gen
HF_TOKEN=hf_... python run_batch.py turtle
```

## Manual single clip

```bash
cd casa-companion-master/pipelines/3d-character-gen
HF_TOKEN=hf_... python video_gen_character.py turtle idle
```

## Post-generation deployment

After the swarm finishes, copy the generated clips to web-revamp and update the video map:

```powershell
cd casa-companion-master
Copy-Item static/videos/v2/*_idle.mp4 web-revamp/public/videos/
Copy-Item static/videos/v2/*_speaking.mp4 web-revamp/public/videos/
# Then update web-revamp/src/lib/characterVideos.ts and rebuild/deploy
```

English hero slugs must be mapped to Italian web-revamp slugs before updating `characterVideos.ts`:

| English | Italian |
|---------|---------|
| bear | orsetto |
| bunny | coniglio |
| crow | corvo |
| dragon | drago |
| dolphin | delfino |
| elephant | elefante |
| fox | volpe |
| lion | leone |
| octopus | polpo |
| owl | gufo |
| turtle | tartaruga |
| wolf | *(not in web-revamp)* |
| phoenix | *(not in web-revamp)* |
