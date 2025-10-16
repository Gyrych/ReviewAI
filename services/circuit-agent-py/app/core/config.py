from pydantic import BaseSettings
from typing import Optional, Dict

class Settings(BaseSettings):
    port: int = 4001
    base_path: str = "/api/v1/circuit-agent"
    storage_root: str = "./storage"
    openrouter_base: str = ""
    redis_url: Optional[str] = None
    llm_timeout_ms: int = 7200000
    vision_timeout_ms: int = 7200000
    keep_alive_msecs: int = 60000
    fetch_retries: int = 1

    class Config:
        env_file = ".env"

_cfg: Optional[Settings] = None

def get_config() -> Settings:
    global _cfg
    if _cfg is None:
        _cfg = Settings()
    return _cfg
