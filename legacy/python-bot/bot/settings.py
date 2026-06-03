"""
User-editable trading parameters — no API keys or secrets.

Edit values here to tune timeframe, risk, symbols, and indicators.
Restart the bot after changes.
"""

from __future__ import annotations

from datetime import datetime, time, timezone

# --- Time / timeframe ---
# Smallest candle size allowed. TIMEFRAME must not be shorter than this.
MIN_TIMEFRAME = "5m"

# Active candle timeframe for EMA signals (must be >= MIN_TIMEFRAME).
TIMEFRAME = "5m"

POLL_INTERVAL_SECONDS = 60
CANDLE_LOOKBACK = 100

TRADING_HOURS_ENABLED = False
TRADING_HOURS_START = "00:00"  # UTC
TRADING_HOURS_END = "23:59"  # UTC

# --- Amount / Risk ---
RISK_PER_TRADE_PCT = 1.0
MAX_OPEN_POSITIONS = 3
LEVERAGE = 5
MIN_TRADE_USDT = 10.0
MAX_TRADE_USDT = 100.0  # None = no cap
FIXED_TRADE_USDT = None  # None = use risk-based sizing

# --- Strategy ---
SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
]

EMA_FAST = 20
EMA_SLOW = 50
ATR_PERIOD = 14
ATR_STOP_MULTIPLIER = 1.0
REWARD_RISK_RATIO = 2.0

# --- Logging ---
LOG_LEVEL = "INFO"  # INFO or DEBUG (DEBUG details go to bot.log)
LOG_SYMBOL_SNAPSHOTS = True  # per-symbol EMA/ATR lines (DEBUG level)
LOG_CYCLE_SUMMARY = True  # one-line stats per cycle

TIMEFRAME_MINUTES: dict[str, int] = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 120,
    "4h": 240,
    "1d": 1440,
}


def timeframe_to_minutes(tf: str) -> int:
    minutes = TIMEFRAME_MINUTES.get(tf)
    if minutes is None:
        supported = ", ".join(sorted(TIMEFRAME_MINUTES, key=lambda k: TIMEFRAME_MINUTES[k]))
        raise ValueError(f"Unsupported timeframe {tf!r}. Supported: {supported}")
    return minutes


def validate_timeframe() -> None:
    """Ensure TIMEFRAME is not shorter than MIN_TIMEFRAME."""
    min_m = timeframe_to_minutes(MIN_TIMEFRAME)
    tf_m = timeframe_to_minutes(TIMEFRAME)
    if tf_m < min_m:
        raise ValueError(
            f"TIMEFRAME={TIMEFRAME!r} is shorter than MIN_TIMEFRAME={MIN_TIMEFRAME!r}. "
            f"Increase TIMEFRAME or lower MIN_TIMEFRAME in settings.py."
        )


def _parse_hhmm(value: str) -> time:
    hour, minute = value.strip().split(":")
    return time(int(hour), int(minute))


def _minutes_since_midnight(value: time) -> int:
    return value.hour * 60 + value.minute


def is_within_trading_hours(now: datetime | None = None) -> bool:
    """Return True if new entries are allowed at the given UTC moment."""
    if not TRADING_HOURS_ENABLED:
        return True

    now = now or datetime.now(timezone.utc)
    current = _minutes_since_midnight(now.time())
    start = _minutes_since_midnight(_parse_hhmm(TRADING_HOURS_START))
    end = _minutes_since_midnight(_parse_hhmm(TRADING_HOURS_END))

    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def to_ccxt_symbol(symbol: str) -> str:
    """Convert BTCUSDT to CCXT linear perpetual format."""
    if symbol.endswith("USDT"):
        base = symbol[:-4]
        return f"{base}/USDT:USDT"
    return symbol
