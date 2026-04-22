"""Runtime configuration via env vars."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    opensearch_url: str = "http://localhost:9200"
    opensearch_index: str = "openbeelden"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    llm_provider: str = "ollama"
    llm_model: str = "ollama/qwen2.5:7b-instruct"
    llm_base_url: str = "http://localhost:11434"
    llm_api_key: str | None = None
    llm_timeout_s: int = 60

    spacy_model: str = "nl_core_news_md"
    clip_model: str = "ViT-B-32"
    clip_pretrained: str = "laion2b_s34b_b79k"

    data_dir: str = "./data"
    faiss_index_path: str = "./data/faiss/clip.index"
    faiss_meta_path: str = "./data/faiss/clip.meta.pkl"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
