"""Runtime configuration for ZAP Studio's backend."""
from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_home() -> Path:
    return Path(os.environ.get("BURPZAP_HOME", Path.home() / ".zap-studio"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BURPZAP_", env_file=".env", extra="ignore")

    # --- HTTP server ---
    host: str = "0.0.0.0"
    port: int = 8070

    # --- ZAP daemon ---
    zap_host: str = "127.0.0.1"
    zap_port: int = 8090
    zap_key: str = ""
    zap_path: str = ""  # explicit path to zap.sh; empty => autodetect
    zap_home: str = ""  # ZAP session dir; empty => <home>/zap
    autostart_zap: bool = True
    zap_startup_timeout: int = 180

    # --- ZAP proxy ---
    proxy_host: str = "localhost"
    proxy_port: int = 8080
    manage_proxy: bool = True  # ensure a proxy local server exists on startup

    # --- App ---
    home: Path = _default_home()
    request_timeout: float = 60.0

    @property
    def api_url(self) -> str:
        return f"http://{self.zap_host}:{self.zap_port}/JSON"

    @property
    def session_dir(self) -> Path:
        return Path(self.zap_home) if self.zap_home else self.home / "zap"

    @property
    def effective_zap_key(self) -> str:
        if not self.zap_key:
            key_file = self.home / "api.key"
            if key_file.exists():
                self.zap_key = key_file.read_text().strip()
            else:
                self.zap_key = secrets.token_urlsafe(24)
                key_file.parent.mkdir(parents=True, exist_ok=True)
                key_file.write_text(self.zap_key)
                key_file.chmod(0o600)
        return self.zap_key


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.home.mkdir(parents=True, exist_ok=True)
    return settings
