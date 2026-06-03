"""Bot entry point: safety gates, scan loop, and state persistence."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from bot import settings
from bot.broker import open_position, setup_leverage, sync_positions, update_stops
from bot.config import load_config
from bot.logger import log_trade, setup_logging
from bot.risk import calculate_size, can_open_new, compute_levels, get_equity
from bot.scanner import create_exchange, fetch_all
from bot.strategy import detect_crossover, get_symbol_snapshot

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="EMA crossover Binance futures bot")
    parser.add_argument(
        "--confirm-live",
        action="store_true",
        help="Skip interactive live confirmation (still requires ALLOW_LIVE=true)",
    )
    return parser.parse_args()


def confirm_live_mode(config, args: argparse.Namespace) -> None:
    if not config.is_live:
        return

    banner = "=" * 60
    print(banner)
    print("  TRADING MODE: LIVE (REAL MONEY)")
    print(banner)

    if args.confirm_live:
        logger.warning("Live mode started with --confirm-live flag.")
        return

    phrase = config.live_confirm_phrase
    typed = input(f"Type {phrase!r} to continue: ").strip()
    if typed != phrase:
        raise SystemExit("Live confirmation failed. Aborting.")


def load_state(path: Path) -> dict:
    if not path.exists():
        return {
            "last_signals": {},
        }
    with path.open(encoding="utf-8") as fh:
        state = json.load(fh)
    state.setdefault("last_signals", {})
    return state


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2, default=str)


def already_processed(state: dict, symbol: str, candle_ts) -> bool:
    last = state.get("last_signals", {}).get(symbol)
    if last is None:
        return False
    return str(last) == str(candle_ts)


def mark_processed(state: dict, symbol: str, candle_ts) -> None:
    state.setdefault("last_signals", {})[symbol] = str(candle_ts)


def _log_snapshot(snapshot) -> None:
    logger.debug(
        "%s | close=%.4f | ema%d=%.4f | ema%d=%.4f | atr=%.4f | trend=%s | crossover=%s | bar=%s",
        snapshot.symbol,
        snapshot.close,
        settings.EMA_FAST,
        snapshot.ema_fast,
        settings.EMA_SLOW,
        snapshot.ema_slow,
        snapshot.atr,
        snapshot.trend,
        snapshot.crossover,
        snapshot.candle_timestamp,
    )


def run_loop(config, exchange) -> None:
    state = load_state(config.state_file)
    setup_leverage(exchange)
    cycle = 0
    poll = settings.POLL_INTERVAL_SECONDS

    logger.info(
        "Starting scan loop | mode=%s | symbols=%s | timeframe=%s | min_timeframe=%s | poll=%ds | log_level=%s",
        config.trading_mode,
        ",".join(settings.SYMBOLS),
        settings.TIMEFRAME,
        settings.MIN_TIMEFRAME,
        poll,
        settings.LOG_LEVEL,
    )

    while True:
        cycle += 1
        cycle_started = time.monotonic()
        stats = {
            "scanned": 0,
            "signals": 0,
            "skipped_duplicate": 0,
            "skipped_hours": 0,
            "skipped_capacity": 0,
            "skipped_size": 0,
            "entries": 0,
            "errors": 0,
        }

        try:
            equity = get_equity(exchange)
            open_positions = sync_positions(exchange)
            allow_entries = settings.is_within_trading_hours()

            logger.info(
                "Cycle #%d start | equity=%.2f USDT | open_positions=%d | entries_allowed=%s",
                cycle,
                equity,
                len(open_positions),
                allow_entries,
            )

            if open_positions:
                for pos in open_positions:
                    logger.debug(
                        "Open position | %s %s size=%.6f entry=%.4f",
                        pos.symbol,
                        pos.side.value,
                        pos.size,
                        pos.entry_price,
                    )

            update_stops(exchange, open_positions)

            if not allow_entries:
                logger.info("Outside trading hours; new entries disabled this cycle.")

            candles = fetch_all(exchange)
            for symbol, df in candles.items():
                stats["scanned"] += 1

                snapshot = get_symbol_snapshot(df, symbol)
                if snapshot and settings.LOG_SYMBOL_SNAPSHOTS:
                    _log_snapshot(snapshot)

                signal = detect_crossover(df, symbol)
                if signal is None:
                    continue

                stats["signals"] += 1
                logger.info(
                    "Signal detected | %s %s | entry=%.4f | ema%d=%.4f | ema%d=%.4f | atr=%.4f | bar=%s",
                    symbol,
                    signal.side.value.upper(),
                    signal.entry_price,
                    settings.EMA_FAST,
                    signal.ema_fast,
                    settings.EMA_SLOW,
                    signal.ema_slow,
                    signal.atr,
                    signal.candle_timestamp,
                )

                if already_processed(state, symbol, signal.candle_timestamp):
                    stats["skipped_duplicate"] += 1
                    logger.debug("%s signal already processed for bar %s", symbol, signal.candle_timestamp)
                    continue

                if not allow_entries:
                    stats["skipped_hours"] += 1
                    logger.info("Signal skipped | %s | reason=outside trading hours", symbol)
                    continue

                if not can_open_new(exchange, symbol):
                    stats["skipped_capacity"] += 1
                    mark_processed(state, symbol, signal.candle_timestamp)
                    logger.info("Signal skipped | %s | reason=capacity or existing position", symbol)
                    continue

                stop, take_profit = compute_levels(signal.entry_price, signal.atr, signal.side)
                size = calculate_size(equity, signal.entry_price, stop)
                if size is None:
                    stats["skipped_size"] += 1
                    mark_processed(state, symbol, signal.candle_timestamp)
                    logger.warning(
                        "Signal skipped | %s | reason=invalid size | equity=%.2f entry=%.4f stop=%.4f",
                        symbol,
                        equity,
                        signal.entry_price,
                        stop,
                    )
                    continue

                notional = size * signal.entry_price
                logger.info(
                    "Placing order | %s %s | size=%.6f | notional=%.2f USDT | stop=%.4f | tp=%.4f",
                    symbol,
                    signal.side.value.upper(),
                    size,
                    notional,
                    stop,
                    take_profit,
                )

                result = open_position(
                    exchange,
                    symbol,
                    signal.side,
                    size,
                    stop,
                    take_profit,
                )
                mark_processed(state, symbol, signal.candle_timestamp)

                if result:
                    stats["entries"] += 1
                    entry_order = result.get("entry") or {}
                    logger.info(
                        "Entry filled | %s | order_id=%s | amount=%.6f",
                        symbol,
                        entry_order.get("id"),
                        float(result.get("amount", size)),
                    )
                    log_trade(
                        config,
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        symbol=symbol,
                        side=signal.side.value,
                        entry=signal.entry_price,
                        stop=stop,
                        take_profit=take_profit,
                        size=float(result.get("amount", size)),
                        signal_type="ema_crossover",
                        order_id=str(entry_order.get("id", "")),
                    )
                else:
                    stats["errors"] += 1
                    logger.error("Order failed | %s | no result from broker", symbol)

            save_state(config.state_file, state)

            elapsed = time.monotonic() - cycle_started
            if settings.LOG_CYCLE_SUMMARY:
                logger.info(
                    "Cycle #%d done in %.1fs | scanned=%d signals=%d entries=%d "
                    "| skipped: dup=%d hours=%d capacity=%d size=%d errors=%d",
                    cycle,
                    elapsed,
                    stats["scanned"],
                    stats["signals"],
                    stats["entries"],
                    stats["skipped_duplicate"],
                    stats["skipped_hours"],
                    stats["skipped_capacity"],
                    stats["skipped_size"],
                    stats["errors"],
                )

            sleep_for = max(0, poll - elapsed)
            if sleep_for < poll:
                logger.debug("Sleeping %.1fs until next cycle (poll=%ds)", sleep_for, poll)
            else:
                logger.warning(
                    "Cycle #%d took %.1fs (> poll %ds); starting next cycle immediately",
                    cycle,
                    elapsed,
                    poll,
                )
                sleep_for = 0

        except KeyboardInterrupt:
            raise
        except Exception as exc:
            stats["errors"] += 1
            logger.exception("Cycle #%d error: %s", cycle, exc)
            sleep_for = poll

        time.sleep(sleep_for)


def main() -> None:
    args = parse_args()
    config = load_config()
    config.validate()
    settings.validate_timeframe()

    log = setup_logging(config)
    if config.is_demo:
        log.info("=== TRADING MODE: DEMO ===")
    else:
        confirm_live_mode(config, args)

    try:
        exchange = create_exchange(config)
        equity = get_equity(exchange)
        log.info("Connected. Initial equity: %.2f USDT", equity)
        run_loop(config, exchange)
    except KeyboardInterrupt:
        log.info("Shutdown requested.")
        sys.exit(0)


if __name__ == "__main__":
    main()
