"""
Hand the full Casa situation to Azure GPT-4o and ask it for a concrete
video-production plan. Peter's directive: video, not a unit. Use Azure
to plan, then execute.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import json
import os
import urllib.request

KEY = os.getenv("AZURE_API_KEY") or "YOUR_AZURE_API_KEY_HERE"
BASE = "https://gce-personal-resource.openai.azure.com"
DEPLOY = "gpt-4o"
URL = f"{BASE}/openai/deployments/{DEPLOY}/chat/completions?api-version=2024-10-21"

SYSTEM = """You are the Consigliere for Casa Companion — Peter's product.
You give concrete, decisive, executable plans. No menus. No hedging.
No "you could also consider". Pick the best path and say exactly what to do.
Speak plainly, short sentences, bullets where useful.

Casa Companion is a conversational character for kids, displayed on a TV
via browser. Character is Corvo (a crow — Peter's family character).
Voice pipeline already works (Azure GPT-4o chat + gpt-4o-mini-tts +
Whisper STT). Everything runs on Render (casa-companion.onrender.com).

Peter's explicit direction just now: "We're not looking for a fucking
unit. We're looking for a video." Video clips, not real-time 3D.

Available credentials / APIs:
- Azure OpenAI (this instance: gpt-4o, gpt-4o-mini-tts, whisper)
- Azure FLUX.1-Kontext-pro image generation (peterwilson7092ai resource)
- HuggingFace token (hf_pTpQDqWm...) — full Inference Providers access
  (Replicate, fal, Together, WaveSpeed, etc. via unified OpenAI-compat API)
- RunPod / Vast.ai possible for cloud GPU if needed
- No Runway / Kling / Sora API key yet — Peter would need to sign up

Already built:
- /tv (2D layered Corvo rig with unified mood engine — arousal/valence/
  energy/worldMemory driving trees, fireflies, moon, beak, wings)
- /tv3d (Three.js scene with Hunyuan 3D mesh — judged "horrible")
- 8 SAM-extracted semantic layers of Corvo (body/head/beak/eye/L+R wings
  /tail/legs) as transparent PNGs at /static/images/tv/corvo/layers/
- 1 decent hero Corvo image: static/images/heroes/crow.webp (front plush)

Already tried and rejected: TRELLIS (bad mesh), Hunyuan3D (mangled),
See-through (anime schema, wrong for bird), 2D layered rig (rigid).

The goal: a video-based pipeline where Corvo feels alive on TV,
still responds to conversation, cheap enough to run per kid session.
Think: pre-render a library of short clips (idle, flight, speaking-
cycle, blinking, looking-around). Play + cross-fade based on mood state.
Beak sync via 2D overlay on the video layer.
"""

USER = """Peter just told me to pivot to video. Give me the concrete
plan to execute TONIGHT — next 2-4 hours of work.

Cover:
1. Which video-generation service to use RIGHT NOW (pick one, justify
   briefly — Runway Gen-4 vs Kling 3 vs Luma vs Pika vs HF-hosted open
   models like CogVideoX / HunyuanVideo / Wan2.1). What's cheapest+
   highest-quality for cartoon plush crow. What API access path.
2. How to get CHARACTER CONSISTENCY across clips — same Corvo in every
   clip, not 8 different crows. Reference image conditioning? Lora?
   First-frame conditioning? Be specific.
3. The exact clip list to generate first (6-10 clips, 3-5s each). What
   prompts, what motions.
4. How the player chooses / blends clips during conversation — loop the
   idle, cross-fade to speaking on state change, overlay lip-sync on
   the beak region. Architecture in 5 lines.
5. How lip-sync works on a pre-rendered video — mask/overlay approach,
   since the video has a baked-in mouth shape. Be specific (alpha mask
   around beak, real-time 2D beak layer on top driven by audio amplitude).
6. Costs: rough estimate per 1000 kid-sessions given the clip library +
   ongoing TTS. We don't re-generate video per conversation; clips are
   fixed assets.
7. The single biggest thing that could make this fail, and how to avoid it.

Be concrete. Service names + URLs + API snippets where helpful. No
"consider" language. Decide."""


def main() -> None:
    body = json.dumps({
        "model": DEPLOY,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user",   "content": USER},
        ],
        "temperature": 0.3,
        "max_tokens": 2200,
    }).encode()
    req = urllib.request.Request(
        URL,
        data=body,
        headers={"Content-Type": "application/json", "api-key": KEY},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        payload = json.loads(resp.read())
    print(payload["choices"][0]["message"]["content"])


if __name__ == "__main__":
    main()
