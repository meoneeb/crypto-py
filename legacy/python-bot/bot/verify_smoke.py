"""Smoke tests for config guards and strategy indicators (no API keys required)."""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from bot.config import Config, load_config
from bot import settings
from bot.risk import calculate_size, compute_levels
from bot.strategy import Side, add_indicators, detect_crossover


def test_live_guard() -> None:
    config = load_config()
    live_blocked = Config(
        trading_mode="live",
        demo_api_key="",
        demo_api_secret="",
        live_api_key="key",
        live_api_secret="secret",
        allow_live=False,
        live_confirm_phrase="CONFIRM LIVE",
        project_root=config.project_root,
    )
    try:
        live_blocked.validate()
        raise AssertionError("Expected live mode to be blocked without ALLOW_LIVE")
    except ValueError:
        pass


def test_indicators_and_risk() -> None:
    n = 120
    rng = np.random.default_rng(0)
    closes = 100 + np.cumsum(rng.normal(0, 1, n))
    df = pd.DataFrame(
        {
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="5min", tz="UTC"),
            "open": closes,
            "high": closes + 1,
            "low": closes - 1,
            "close": closes,
            "volume": rng.integers(100, 1000, n),
        }
    )
    enriched = add_indicators(df)
    assert enriched["ema_fast"].iloc[-1] > 0

    stop, tp = compute_levels(100.0, 2.0, Side.LONG)
    assert stop < 100.0 < tp

    size = calculate_size(10_000, 100.0, stop)
    assert size is not None and size > 0

    signal = detect_crossover(df, "BTCUSDT")
    assert signal is None or signal.symbol == "BTCUSDT"


def test_settings_helpers() -> None:
    assert settings.to_ccxt_symbol("BTCUSDT") == "BTC/USDT:USDT"
    assert settings.is_within_trading_hours() is True
    settings.validate_timeframe()


def main() -> int:
    test_live_guard()
    test_indicators_and_risk()
    test_settings_helpers()
    print("All smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
