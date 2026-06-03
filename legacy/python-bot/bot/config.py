"""Runtime configuration: secrets, mode switching, and paths."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from bot import settings

load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    trading_mode: str
    demo_api_key: str
    demo_api_secret: str
    live_api_key: str
    live_api_secret: str
    allow_live: bool
    live_confirm_phrase: str
    project_root: Path

    @property
    def is_demo(self) -> bool:
        return self.trading_mode == "demo"

    @property
    def is_live(self) -> bool:
        return self.trading_mode == "live"

    @property
    def state_file(self) -> Path:
        return self.project_root / f"state.{self.trading_mode}.json"

    @property
    def log_dir(self) -> Path:
        return self.project_root / "logs" / self.trading_mode

    def active_api_key(self) -> str:
        if self.is_demo:
            return self.demo_api_key
        return self.live_api_key

    def active_api_secret(self) -> str:
        if self.is_demo:
            return self.demo_api_secret
        return self.live_api_secret

    def validate(self) -> None:
        mode = self.trading_mode.lower()
        if mode not in {"demo", "live"}:
            raise ValueError(f"Invalid TRADING_MODE: {self.trading_mode!r}. Use 'demo' or 'live'.")

        if self.is_live and not self.allow_live:
            raise ValueError(
                "TRADING_MODE=live but ALLOW_LIVE is not true. "
                "Set ALLOW_LIVE=true in .env to enable live trading."
            )

        key = self.active_api_key()
        secret = self.active_api_secret()
        if not key or not secret:
            label = "BINANCE_DEMO" if self.is_demo else "BINANCE_LIVE"
            raise ValueError(f"Missing {label}_API_KEY or {label}_API_SECRET for {mode} mode.")


def load_config(project_root: Path | None = None) -> Config:
    root = project_root or Path(__file__).resolve().parent.parent
    return Config(
        trading_mode=os.getenv("TRADING_MODE", "demo").strip().lower(),
        demo_api_key=os.getenv("BINANCE_DEMO_API_KEY", "").strip(),
        demo_api_secret=os.getenv("BINANCE_DEMO_API_SECRET", "").strip(),
        live_api_key=os.getenv("BINANCE_LIVE_API_KEY", "").strip(),
        live_api_secret=os.getenv("BINANCE_LIVE_API_SECRET", "").strip(),
        allow_live=_env_bool("ALLOW_LIVE", False),
        live_confirm_phrase=os.getenv("LIVE_CONFIRM_PHRASE", "CONFIRM LIVE").strip(),
        project_root=root,
    )


# Re-export settings for convenience
__all__ = ["Config", "load_config", "settings"]
