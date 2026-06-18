"""Replace placeholder Cartesia voice IDs with real Sonic 3 voice IDs."""
import os
import sys

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://udbgzgntfiytnuajnbvy.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not SUPABASE_SERVICE_KEY:
    print("Set SUPABASE_SERVICE_KEY")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

VOICE_MAP = {
    "orsetto": "d6b0c62a-c7ff-477c-9a1f-eadd64b94360",
    "drago": "820a3788-2b37-4d21-847a-b65d8a68c99a",
    "lupo": "efa653e5-314d-46ca-9f90-70ac7d6ca71e",
    "gufo": "829ccd10-f8b3-43cd-b8a0-4aeaa81f3b30",
    "coniglio": "cc00e582-ed66-4004-8336-0175b85c85f6",
    "gatto": "f9fc912e-52f0-448a-8bfa-47e9ca75f25a",
    "volpe": "710feaa3-b550-42f3-b3eb-6f37f2a7cc0a",
    "tartaruga": "d46abd1d-2d02-43e8-819f-51fb652c1c61",
    "cerbiatto": "f9836c6e-a0bd-460e-9d3c-f7299fa60f94",
    "riccio": "58fbaf73-d7de-4e82-a6b3-118180e7057c",
    "aquila": "0b32066b-2bcc-44b9-89ab-0223a09d1606",
    "folletto": "f6ce3444-478b-4ce4-982e-bcb72dffe7aa",
    "stella": "62305e79-9d39-4643-b003-5e0b096fe4f4",
}


def update_character(character_key: str, voice_id: str):
    url = f"{SUPABASE_URL}/rest/v1/character_modes"
    params = {"character_key": f"eq.{character_key}"}
    r = requests.patch(url, headers=HEADERS, params=params, json={"voice_id": voice_id})
    print(f"{character_key}: {r.status_code}")
    r.raise_for_status()


def main():
    for character_key, voice_id in VOICE_MAP.items():
        update_character(character_key, voice_id)
    print("Done")


if __name__ == "__main__":
    main()
