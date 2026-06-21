import os

from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env from the project backend directory regardless of cwd.
_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API keys
    deepgram_api_key: str
    openai_api_key: str
    elevenlabs_api_key: str

    # Provider config
    deepgram_model: str = "nova-3"
    openai_model: str = "gpt-4o-mini"
    elevenlabs_voice_id: str = ""
    elevenlabs_model: str = "eleven_turbo_v2_5"

    # Server config
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # Safety
    blocked_words: str = ""

    @property
    def blocked_words_list(self) -> list[str]:
        return [w.strip().lower() for w in self.blocked_words.split(",") if w.strip()]


settings = Settings()
