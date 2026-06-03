"""Exchange connectivity and OHLCV fetching."""

from __future__ import annotations

import logging

import ccxt
import pandas as pd

from bot.config import Config
from bot import settings

logger = logging.getLogger(__name__)


def create_exchange(config: Config) -> ccxt.binanceusdm:
    exchange = ccxt.binanceusdm(
        {
            "apiKey": config.active_api_key(),
            "secret": config.active_api_secret(),
            "enableRateLimit": True,
            "options": {"defaultType": "future"},
        }
    )

    if config.is_demo:
        exchange.enable_demo_trading(True)
        logger.info("Demo trading enabled on exchange client.")

    exchange.load_markets()
    return exchange


def fetch_candles(
    exchange: ccxt.binanceusdm,
    symbol: str,
    timeframe: str | None = None,
    limit: int | None = None,
) -> pd.DataFrame:
    ccxt_symbol = settings.to_ccxt_symbol(symbol)
    timeframe = timeframe or settings.TIMEFRAME
    limit = limit or settings.CANDLE_LOOKBACK

    ohlcv = exchange.fetch_ohlcv(ccxt_symbol, timeframe=timeframe, limit=limit)
    logger.debug(
        "Fetched %d candles | %s %s | latest=%s",
        len(ohlcv),
        symbol,
        timeframe,
        ohlcv[-1][0] if ohlcv else "n/a",
    )
    df = pd.DataFrame(
        ohlcv,
        columns=["timestamp", "open", "high", "low", "close", "volume"],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)
    return df


def fetch_all(
    exchange: ccxt.binanceusdm,
    symbols: list[str] | None = None,
) -> dict[str, pd.DataFrame]:
    symbols = symbols or settings.SYMBOLS
    result: dict[str, pd.DataFrame] = {}
    for symbol in symbols:
        try:
            result[symbol] = fetch_candles(exchange, symbol)
        except Exception as exc:
            logger.error("Failed to fetch candles for %s: %s", symbol, exc)
    return result
