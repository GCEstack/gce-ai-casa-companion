"""
Push Corvo hero art through Jbowyer/Hunyuan3D-2.1 (Tencent's model on an L40S).
Hunyuan3D is tuned better for stylized / toy / cartoon subjects than TRELLIS.

Returns a textured GLB. Saves to static/models/corvo/corvo_hunyuan.glb.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import shutil
from pathlib import Path

from gradio_client import Client, handle_file

SRC = Path(r"C:\Claude\Personal\casa-companion\static\images\heroes\crow.webp")
OUT_DIR = Path(r"C:\Claude\Personal\casa-companion\workspace\corvo_3d")
STATIC_OUT = Path(r"C:\Claude\Personal\casa-companion\static\models\corvo")

SPACE = "Jbowyer/Hunyuan3D-2.1"


def main() -> None:
    assert SRC.exists(), f"Source missing: {SRC}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_OUT.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN")
    assert token, "HF_TOKEN env var required"

    print(f"Connecting to {SPACE}...")
    client = Client(SPACE, token=token)

    # Print available endpoints so we can see what we can call
    try:
        info = client.view_api(return_format="dict")
        ep_names = list((info or {}).get("named_endpoints", {}).keys())
        print(f"Endpoints: {ep_names}")
    except Exception as e:
        print(f"(view_api failed: {e})")
        ep_names = []

    # Try the common endpoint names in order
    candidate_endpoints = [
        "/generation_all",
        "/shape_generation",
        "/generate",
        "/infer",
        "/predict",
    ]

    result = None
    used_endpoint = None
    last_err = None

    for ep in candidate_endpoints:
        if ep_names and ep not in ep_names:
            continue
        try:
            print(f"Trying {ep}...")
            result = client.predict(
                image=handle_file(str(SRC)),
                api_name=ep,
            )
            used_endpoint = ep
            break
        except Exception as e:
            last_err = e
            print(f"  {ep} failed: {e}")

    if result is None:
        # Fall back: try the first endpoint in ep_names with minimal args
        if ep_names:
            ep = ep_names[0]
            print(f"Falling back to first endpoint: {ep}")
            result = client.predict(handle_file(str(SRC)), api_name=ep)
            used_endpoint = ep
        else:
            raise RuntimeError(f"No endpoint worked. Last error: {last_err}")

    print(f"\nUsed endpoint: {used_endpoint}")
    print(f"Result type: {type(result)}")
    if isinstance(result, (list, tuple)):
        for i, item in enumerate(result):
            print(f"  [{i}] {item}")
    else:
        print(f"  {result}")

    # Find the GLB / OBJ in the result
    def find_model(obj):
        if isinstance(obj, str) and (obj.endswith(".glb") or obj.endswith(".obj") or obj.endswith(".ply")):
            return obj
        if isinstance(obj, dict):
            for v in obj.values():
                hit = find_model(v)
                if hit:
                    return hit
        if isinstance(obj, (list, tuple)):
            for v in obj:
                hit = find_model(v)
                if hit:
                    return hit
        return None

    model_path = find_model(result)
    assert model_path, "No GLB/OBJ found in result"

    dest_name = "corvo_hunyuan" + Path(model_path).suffix
    dest_workspace = OUT_DIR / dest_name
    dest_static = STATIC_OUT / dest_name
    shutil.copy2(model_path, dest_workspace)
    shutil.copy2(model_path, dest_static)
    size_mb = dest_workspace.stat().st_size / (1024 * 1024)
    print(f"\nSaved: {dest_workspace}  ({size_mb:.2f} MB)")
    print(f"Saved: {dest_static}  (served at /static/models/corvo/{dest_name})")


if __name__ == "__main__":
    main()
