"""Generate a 16kHz PCM s16le test utterance via Cartesia."""
import os
import sys

import requests

CARTESIA_API_KEY = os.environ.get("CARTESIA_API_KEY", "")
if not CARTESIA_API_KEY:
    print("Set CARTESIA_API_KEY")
    sys.exit(1)

VOICE_ID = "d6b0c62a-c7ff-477c-9a1f-eadd64b94360"  # Melina - Bright Spirit
TEXT = "Hello, how are you today?"

payload = {
    "model_id": "sonic-3",
    "transcript": f"<speak><prosody>{TEXT}</prosody></speak>",
    "voice": {"mode": "id", "id": VOICE_ID},
    "output_format": {
        "container": "raw",
        "encoding": "pcm_s16le",
        "sample_rate": 16000,
    },
    "language": "en",
}
headers = {
    "X-API-Key": CARTESIA_API_KEY,
    "Cartesia-Version": "2024-06-10",
    "Content-Type": "application/json",
}

r = requests.post("https://api.cartesia.ai/tts/bytes", headers=headers, json=payload)
r.raise_for_status()
out_path = os.path.join(os.path.dirname(__file__), "test_16k_pcm.raw")
with open(out_path, "wb") as f:
    f.write(r.content)
print(f"Wrote {len(r.content)} bytes to {out_path}")
