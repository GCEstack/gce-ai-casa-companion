#!/usr/bin/env python3
"""
Pluggable image-to-video backend adapters.
"""
from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import requests


class ImageUploader:
    """Upload a local image to a temporary public URL."""

    @staticmethod
    def upload(image_path: Path, prefer_fal: bool = True) -> str:
        if prefer_fal:
            try:
                import fal_client

                if os.getenv("FAL_KEY"):
                    return fal_client.upload_file(str(image_path))
            except Exception:
                pass
        return ImageUploader._upload_0x0st(image_path)

    @staticmethod
    def _upload_0x0st(image_path: Path) -> str:
        url = "https://0x0.st"
        with open(image_path, "rb") as f:
            response = requests.post(url, files={"file": f}, timeout=120)
        response.raise_for_status()
        return response.text.strip()


class BaseBackend(ABC):
    def __init__(self, config: dict[str, Any], backend_key: str):
        self.config = config
        self.backend_key = backend_key
        self.backend_cfg = config.get("backends", {}).get(backend_key, {})
        self.cost_per_second = config.get("cost_per_second", {}).get(backend_key, 0.05)

    def get_api_key(self) -> str:
        env_name = self.backend_cfg.get("env_key", "FAL_KEY")
        key = os.getenv(env_name)
        if not key:
            raise RuntimeError(f"Missing API key. Set the {env_name} environment variable.")
        return key

    def estimate_cost(self, duration: int, resolution: str = "720p") -> float:
        return self.cost_per_second * duration

    @abstractmethod
    def max_clip_duration(self) -> int:
        """Longest single clip this backend can generate."""

    @abstractmethod
    def generate_clip(
        self,
        image_path: Path,
        prompt: str,
        negative_prompt: str,
        duration: int,
        resolution: str,
        aspect_ratio: str,
        seed: int | None,
        output_path: Path,
    ) -> Path:
        """Generate a single clip and save it to output_path."""

    def _download(self, url: str, output_path: Path) -> Path:
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        return output_path


class FalBackend(BaseBackend):
    """fal.ai backend (Pika, Kling, etc.)."""

    def max_clip_duration(self) -> int:
        return self.backend_cfg.get("max_duration", 10)

    def _upload_image(self, image_path: Path) -> str:
        import fal_client
        try:
            return fal_client.upload_file(str(image_path))
        except Exception as e:
            print(f"  [fal] upload_file failed ({e}), falling back to base64 data URI")
            with open(image_path, "rb") as f:
                b64 = __import__("base64").b64encode(f.read()).decode("utf-8")
            ext = image_path.suffix.lower().lstrip(".") or "png"
            mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "bmp": "image/bmp", "gif": "image/gif"}.get(ext, "image/png")
            return f"data:{mime};base64,{b64}"

    def generate_clip(
        self,
        image_path: Path,
        prompt: str,
        negative_prompt: str,
        duration: int,
        resolution: str,
        aspect_ratio: str,
        seed: int | None,
        output_path: Path,
    ) -> Path:
        import fal_client

        model = self.backend_cfg.get("model", "fal-ai/pika/v2.2/image-to-video")
        image_url = self._upload_image(image_path)

        image_field = "start_image_url" if "kling" in model.lower() else "image_url"
        arguments: dict[str, Any] = {
            image_field: image_url,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "resolution": resolution,
            "duration": duration,
        }
        if seed is not None:
            arguments["seed"] = seed

        def on_update(update: Any) -> None:
            if hasattr(update, "logs") and update.logs:
                for log in update.logs:
                    print(f"  [{self.backend_key}] {log.get('message', '')}")

        result = fal_client.subscribe(
            model,
            arguments=arguments,
            with_logs=True,
            on_queue_update=on_update,
        )
        video_url = result["video"]["url"]
        return self._download(video_url, output_path)


class HttpBackend(BaseBackend):
    """
    Generic HTTP backend for services that accept a JSON payload and return
    either a direct video URL or an async task that must be polled.
    Used for Segmind, EvoLink, and similar providers.
    """

    def max_clip_duration(self) -> int:
        return self.backend_cfg.get("max_duration", 5)

    def _map_payload(
        self,
        image_url: str,
        prompt: str,
        negative_prompt: str,
        duration: int,
        resolution: str,
        aspect_ratio: str,
        seed: int | None,
    ) -> dict[str, Any]:
        mapping = self.backend_cfg.get("field_mapping", {})
        payload: dict[str, Any] = {}

        def set_field(key: str, value: Any) -> None:
            if key and value is not None:
                payload[key] = value

        set_field(mapping.get("image"), image_url)
        set_field(mapping.get("prompt"), prompt)
        set_field(mapping.get("negative_prompt"), negative_prompt)
        set_field(mapping.get("duration"), duration)
        set_field(mapping.get("resolution"), resolution)
        set_field(mapping.get("aspect_ratio"), aspect_ratio)
        set_field(mapping.get("cfg_scale"), self.backend_cfg.get("cfg_scale", 0.5))
        set_field(mapping.get("mode"), self.backend_cfg.get("mode", "std"))
        set_field(mapping.get("seed"), seed)
        return payload

    def _extract_video_url(self, data: dict[str, Any]) -> str | None:
        for key in ("video_url", "videoUrl", "url", "output_url"):
            if key in data and isinstance(data[key], str):
                return data[key]
        nested = data.get("video") or data.get("output") or data.get("data")
        if isinstance(nested, dict):
            return self._extract_video_url(nested)
        return None

    def _poll_task(self, endpoint: str, task_id: str, headers: dict[str, str]) -> str:
        poll_url = endpoint.rstrip("/") + f"/{task_id}"
        timeout = self.backend_cfg.get("poll_timeout", 600)
        interval = self.backend_cfg.get("poll_interval", 5)
        elapsed = 0
        while elapsed < timeout:
            response = requests.get(poll_url, headers=headers, timeout=60)
            response.raise_for_status()
            data = response.json()
            status = data.get("status", "").lower()
            if status in ("completed", "success", "done", "finished"):
                url = self._extract_video_url(data)
                if url:
                    return url
                raise RuntimeError(f"Task completed but no video URL in response: {data}")
            if status in ("failed", "error", "failure"):
                raise RuntimeError(f"Task failed: {data.get('error', data)}")
            print(f"  [{self.backend_key}] status={status}, waiting...")
            time.sleep(interval)
            elapsed += interval
        raise RuntimeError(f"Polling timed out after {timeout}s")

    def generate_clip(
        self,
        image_path: Path,
        prompt: str,
        negative_prompt: str,
        duration: int,
        resolution: str,
        aspect_ratio: str,
        seed: int | None,
        output_path: Path,
    ) -> Path:
        endpoint = self.backend_cfg.get("endpoint")
        if not endpoint:
            raise RuntimeError(f"No endpoint configured for {self.backend_key}")

        image_url = ImageUploader.upload(image_path, prefer_fal=False)
        payload = self._map_payload(
            image_url, prompt, negative_prompt, duration, resolution, aspect_ratio, seed
        )
        headers = {
            "Content-Type": "application/json",
            self.backend_cfg.get("auth_header", "x-api-key"): self.get_api_key(),
        }

        response = requests.post(endpoint, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        data = response.json()

        video_url = self._extract_video_url(data)
        if not video_url:
            task_id = data.get("task_id") or data.get("taskId") or data.get("id")
            if not task_id:
                raise RuntimeError(f"No video URL or task ID in response: {data}")
            print(f"  [{self.backend_key}] polling task {task_id}...")
            video_url = self._poll_task(endpoint, task_id, headers)

        return self._download(video_url, output_path)


class PolloBackend(BaseBackend):
    """
    Pollo AI backend.
    Uploads the image via /file/sign, submits to /generation/{brand}/{model},
    and polls until the task is done.
    """

    def max_clip_duration(self) -> int:
        return self.backend_cfg.get("max_duration", 10)

    def _upload(self, image_path: Path) -> str:
        base = self.backend_cfg["base_url"].rstrip("/")
        headers = {"X-API-KEY": self.get_api_key(), "Content-Type": "application/json"}
        ext = image_path.suffix.lower() or ".png"
        mime = "image/png" if ext in (".png",) else "image/jpeg"
        sign_payload = {
            "action": "putObject",
            "filename": image_path.name,
            "type": mime,
        }
        sign_resp = requests.post(f"{base}/file/sign", headers=headers, json=sign_payload, timeout=60)
        sign_resp.raise_for_status()
        sign_data = sign_resp.json().get("data", {})
        signed_url = sign_data.get("signedUrl")
        file_url = sign_data.get("fileUrl")
        if not signed_url or not file_url:
            raise RuntimeError(f"Pollo upload sign failed: {sign_resp.json()}")

        with open(image_path, "rb") as f:
            put_resp = requests.put(signed_url, data=f, headers={"Content-Type": mime}, timeout=120)
        put_resp.raise_for_status()
        return file_url

    def _poll(self, base: str, model_path: str, task_id: str) -> str:
        headers = {"X-API-KEY": self.get_api_key()}
        poll_url = f"{base}/{model_path}/{task_id}"
        timeout = self.backend_cfg.get("poll_timeout", 600)
        interval = self.backend_cfg.get("poll_interval", 5)
        elapsed = 0
        while elapsed < timeout:
            resp = requests.get(poll_url, headers=headers, timeout=60)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            status = str(data.get("status", "")).lower()
            if status in ("completed", "success", "done"):
                return data.get("videoUrl") or data.get("url") or data.get("video_url")
            if status in ("failed", "error"):
                raise RuntimeError(f"Pollo task failed: {data}")
            print(f"  [pika_pollo] status={status}, waiting...")
            time.sleep(interval)
            elapsed += interval
        raise RuntimeError("Pollo polling timed out")

    def generate_clip(
        self,
        image_path: Path,
        prompt: str,
        negative_prompt: str,
        duration: int,
        resolution: str,
        aspect_ratio: str,
        seed: int | None,
        output_path: Path,
    ) -> Path:
        base = self.backend_cfg["base_url"].rstrip("/")
        model_path = self.backend_cfg["model_path"]
        image_url = self._upload(image_path)
        payload = {
            "input": {
                "image": image_url,
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "length": duration,
                "aspectRatio": aspect_ratio,
                "resolution": resolution,
            }
        }
        if seed is not None:
            payload["input"]["seed"] = seed

        headers = {"X-API-KEY": self.get_api_key(), "Content-Type": "application/json"}
        resp = requests.post(f"{base}/{model_path}", headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        resp_data = resp.json().get("data", {})
        task_id = resp_data.get("taskId") or resp_data.get("task_id")
        if not task_id:
            raise RuntimeError(f"No taskId in Pollo response: {resp.json()}")
        video_url = self._poll(base, model_path, task_id)
        return self._download(video_url, output_path)


def get_backend(config: dict[str, Any], backend_key: str) -> BaseBackend:
    if backend_key in ("pika_fal", "kling_fal"):
        return FalBackend(config, backend_key)
    if backend_key == "pika_pollo":
        return PolloBackend(config, backend_key)
    return HttpBackend(config, backend_key)
