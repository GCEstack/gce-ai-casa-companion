"""Seed a test parent + device in Supabase for end-to-end testing."""
import os
import secrets
import sys
import uuid

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://udbgzgntfiytnuajnbvy.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_SERVICE_KEY:
    print("Set SUPABASE_SERVICE_KEY env var")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def create_user(email: str, password: str) -> dict:
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
    }
    r = requests.post(url, headers=HEADERS, json=payload)
    r.raise_for_status()
    return r.json()


def get_user_token(email: str, password: str) -> dict:
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    r = requests.post(
        url,
        headers={"apikey": SUPABASE_SERVICE_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
    )
    r.raise_for_status()
    return r.json()


def insert_parent(user_id: str, email: str) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/parents"
    payload = {
        "id": user_id,
        "email": email,
        "consent_verified": True,
        "consent_method": "manual-test",
        "consent_at": "now()",
    }
    r = requests.post(url, headers=HEADERS, json=payload)
    r.raise_for_status()
    return r.json()[0]


def get_character_mode(character_key: str, mode_key: str) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/character_modes"
    params = {"character_key": f"eq.{character_key}", "mode_key": f"eq.{mode_key}", "select": "*"}
    r = requests.get(url, headers=HEADERS, params=params)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise RuntimeError(f"character_mode {character_key}/{mode_key} not found")
    return rows[0]


def insert_device(parent_id: str, mode_id: str, api_key: str) -> dict:
    device_id = str(uuid.uuid4())
    url = f"{SUPABASE_URL}/rest/v1/devices"
    payload = {
        "id": device_id,
        "parent_id": parent_id,
        "device_type": "test-device",
        "serial_number": f"TEST-{secrets.token_hex(4).upper()}",
        "character_id": mode_id,
        "mode_id": mode_id,
        "battery": 87,
        "api_key": api_key,
        "is_active": True,
    }
    r = requests.post(url, headers=HEADERS, json=payload)
    r.raise_for_status()
    return r.json()[0]


def main():
    email = f"test-{secrets.token_hex(4)}@example.com"
    password = secrets.token_urlsafe(16)
    api_key = secrets.token_urlsafe(32)

    print(f"Creating test user {email} ...")
    user = create_user(email, password)
    user_id = user["id"]
    print(f"  user id: {user_id}")

    print("Inserting parent row ...")
    insert_parent(user_id, email)

    print("Getting character mode ...")
    mode = get_character_mode("orsetto", "bedtime")
    mode_id = mode["id"]
    print(f"  mode id: {mode_id}")

    print("Inserting device ...")
    device = insert_device(user_id, mode_id, api_key)
    device_id = device["id"]
    print(f"  device id: {device_id}")

    print("Getting parent access token ...")
    token_resp = get_user_token(email, password)
    access_token = token_resp["access_token"]

    print("\n--- TEST CREDENTIALS ---")
    print(f"EMAIL={email}")
    print(f"PASSWORD={password}")
    print(f"DEVICE_ID={device_id}")
    print(f"API_KEY={api_key}")
    print(f"ACCESS_TOKEN={access_token}")
    print("------------------------\n")


if __name__ == "__main__":
    main()
