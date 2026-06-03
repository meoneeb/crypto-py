"""Logging setup and CSV trade journal."""

from __future__ import annotations

import csv
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from bot.config import Config
from bot import settings

TRADE_CSV_HEADERS = [
    "timestamp",
    "mode",
    "symbol",
    "side",
    "entry",
    "stop",
    "take_profit",
    "size",
    "signal_type",
    "order_id",
    "pnl",
]


def setup_logging(config: Config) -> logging.Logger:
    config.log_dir.mkdir(parents=True, exist_ok=True)
    log_path = config.log_dir / "bot.log"

    level_name = settings.LOG_LEVEL.upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler()
    console.setLevel(level)
    console.setFormatter(formatter)
    root.addHandler(console)

    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)

    logging.getLogger("bot").info(
        "Logging initialized | level=%s | file=%s",
        level_name,
        log_path,
    )
    return logging.getLogger("bot")


def _ensure_trade_csv(path: Path) -> None:
    if not path.exists():
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=TRADE_CSV_HEADERS)
            writer.writeheader()


def log_trade(
    config: Config,
    *,
    timestamp: str,
    symbol: str,
    side: str,
    entry: float,
    stop: float,
    take_profit: float,
    size: float,
    signal_type: str,
    order_id: str = "",
    pnl: str = "",
) -> None:
    config.log_dir.mkdir(parents=True, exist_ok=True)
    csv_path = config.log_dir / "trades.csv"
    _ensure_trade_csv(csv_path)

    row = {
        "timestamp": timestamp,
        "mode": config.trading_mode,
        "symbol": symbol,
        "side": side,
        "entry": entry,
        "stop": stop,
        "take_profit": take_profit,
        "size": size,
        "signal_type": signal_type,
        "order_id": order_id,
        "pnl": pnl,
    }
    with csv_path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=TRADE_CSV_HEADERS)
        writer.writerow(row)
