"""Pydantic settings for the Casa Pipecat voice server."""

import os
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8001
    log_level: str = "info"

    # AI keys
    deepgram_api_key: str
    openai_api_key: str
    elevenlabs_api_key: str

    # Provider config
    deepgram_model: str = "nova-3"
    openai_model: str = "gpt-4o-mini"
    elevenlabs_voice_id: str = ""
    elevenlabs_model: str = "eleven_turbo_v2_5"

    # Optional Supabase (required for device auth + dashboard)
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Server-to-server secret for dashboard kill switch
    voice_server_api_key: str = "change-me"

    # Safety
    blocked_words: str = ""

    @property
    def blocked_words_list(self) -> list[str]:
        return [w.strip().lower() for w in self.blocked_words.split(",") if w.strip()]

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)


settings = Settings()
