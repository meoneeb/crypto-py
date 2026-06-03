"""EMA crossover strategy and indicator calculations."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
import pandas as pd

from bot import settings


class Side(str, Enum):
    LONG = "long"
    SHORT = "short"


@dataclass(frozen=True)
class Signal:
    symbol: str
    side: Side
    entry_price: float
    atr: float
    candle_timestamp: pd.Timestamp
    ema_fast: float
    ema_slow: float


@dataclass(frozen=True)
class SymbolSnapshot:
    symbol: str
    close: float
    ema_fast: float
    ema_slow: float
    atr: float
    candle_timestamp: pd.Timestamp
    trend: str  # bullish, bearish, or neutral
    crossover: str  # long, short, or none


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["ema_fast"] = out["close"].ewm(span=settings.EMA_FAST, adjust=False).mean()
    out["ema_slow"] = out["close"].ewm(span=settings.EMA_SLOW, adjust=False).mean()

    prev_close = out["close"].shift(1)
    tr = pd.concat(
        [
            out["high"] - out["low"],
            (out["high"] - prev_close).abs(),
            (out["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    out["atr"] = tr.rolling(window=settings.ATR_PERIOD).mean()
    return out


def _trend_label(ema_fast: float, ema_slow: float) -> str:
    if ema_fast > ema_slow:
        return "bullish"
    if ema_fast < ema_slow:
        return "bearish"
    return "neutral"


def get_symbol_snapshot(df: pd.DataFrame, symbol: str) -> SymbolSnapshot | None:
    """Latest closed-bar indicator snapshot for logging."""
    min_len = max(settings.EMA_SLOW, settings.ATR_PERIOD) + 2
    if len(df) < min_len:
        return None

    enriched = add_indicators(df)
    prev = enriched.iloc[-3]
    curr = enriched.iloc[-2]

    if np.isnan(curr["ema_fast"]) or np.isnan(curr["ema_slow"]) or np.isnan(curr["atr"]):
        return None

    crossover = "none"
    if prev["ema_fast"] <= prev["ema_slow"] and curr["ema_fast"] > curr["ema_slow"]:
        crossover = "long"
    elif prev["ema_fast"] >= prev["ema_slow"] and curr["ema_fast"] < curr["ema_slow"]:
        crossover = "short"

    return SymbolSnapshot(
        symbol=symbol,
        close=float(curr["close"]),
        ema_fast=float(curr["ema_fast"]),
        ema_slow=float(curr["ema_slow"]),
        atr=float(curr["atr"]),
        candle_timestamp=curr["timestamp"],
        trend=_trend_label(float(curr["ema_fast"]), float(curr["ema_slow"])),
        crossover=crossover,
    )


def detect_crossover(df: pd.DataFrame, symbol: str) -> Signal | None:
    """Detect crossover on the latest closed candle (skip forming bar)."""
    snapshot = get_symbol_snapshot(df, symbol)
    if snapshot is None or snapshot.crossover == "none":
        return None

    return Signal(
        symbol=symbol,
        side=Side.LONG if snapshot.crossover == "long" else Side.SHORT,
        entry_price=snapshot.close,
        atr=snapshot.atr,
        candle_timestamp=snapshot.candle_timestamp,
        ema_fast=snapshot.ema_fast,
        ema_slow=snapshot.ema_slow,
    )
