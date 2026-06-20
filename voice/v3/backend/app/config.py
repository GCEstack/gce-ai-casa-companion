"""Pydantic settings for the Casa Companion voice server."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )



    # Runtime
    env: str = Field(default="production", alias="ENV")
    port: int = Field(default=8080, alias="PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # API keys
    deepgram_api_key: str = Field(alias="DEEPGRAM_API_KEY")
    groq_api_key: str = Field(alias="GROQ_API_KEY")
    cartesia_api_key: str = Field(alias="CARTESIA_API_KEY")

    # Supabase (service role for the voice server). Optional so the server can
    # start in environments where only the V3 engine (no persistence) is needed.
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_KEY")

    # Server-to-server secret used by the dashboard kill switch
    voice_server_api_key: str = Field(default="", alias="VOICE_SERVER_API_KEY")

    # Models / voices
    deepgram_model: str = Field(default="nova-3", alias="DEEPGRAM_MODEL")
    deepgram_language: str = Field(default="en-US", alias="DEEPGRAM_LANGUAGE")
    deepgram_encoding: str = Field(default="opus", alias="DEEPGRAM_ENCODING")
    groq_model: str = Field(default="llama-3.3-70b-versatile", alias="GROQ_MODEL")
    cartesia_model: str = Field(default="sonic-3", alias="CARTESIA_MODEL")
    cartesia_language: str = Field(default="en", alias="CARTESIA_LANGUAGE")
    tts_output_sample_rate: int = Field(default=24000, alias="TTS_OUTPUT_SAMPLE_RATE")
    stt_input_sample_rate: int = Field(default=16000, alias="STT_INPUT_SAMPLE_RATE")
    tts_chunk_delay_ms: float = Field(default=0.0, alias="TTS_CHUNK_DELAY_MS")

    # Pipeline limits
    max_tts_chars: int = Field(default=500, alias="MAX_TTS_CHARS")
    session_timeout_seconds: int = Field(default=30, alias="SESSION_TIMEOUT_SECONDS")
    max_llm_tokens: int = Field(default=180, alias="MAX_LLM_TOKENS")
    llm_temperature: float = Field(default=0.85, alias="LLM_TEMPERATURE")

    # Optional JSON mapping from character_key -> real Cartesia voice UUID.
    # Example: {"orsetto": "a0e1...", "drago": "b2f3..."}
    cartesia_voice_map: dict[str, str] = Field(default_factory=dict, alias="CARTESIA_VOICE_MAP")

    @field_validator("cartesia_voice_map", mode="before")
    @classmethod
    def _parse_json_map(cls, v: Any) -> dict[str, str]:
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return {}

    # CORS
    cors_origins: list[str] = Field(default=["*"], alias="CORS_ORIGINS")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            if v.strip() == "*":
                return ["*"]
            return [x.strip() for x in v.split(",") if x.strip()]
        return ["*"]

    # Derived
    fly_machine_id: str = Field(default="", alias="FLY_MACHINE_ID")

    def __init__(self, **data: Any):
        super().__init__(**data)
        if not self.fly_machine_id:
            self.fly_machine_id = os.environ.get("FLY_MACHINE_ID", "unknown")
        # Accept the legacy SUPABASE_KEY secret if SUPABASE_SERVICE_KEY is missing.
        if not self.supabase_service_key:
            self.supabase_service_key = os.environ.get("SUPABASE_KEY", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
