"""Position sizing, stop/take-profit levels, and exposure checks."""

from __future__ import annotations

import logging

import ccxt

from bot import settings
from bot.strategy import Side

logger = logging.getLogger(__name__)


def get_equity(exchange: ccxt.binanceusdm) -> float:
    balance = exchange.fetch_balance()
    usdt = balance.get("USDT") or {}
    total = usdt.get("total")
    if total is not None:
        return float(total)
    free = usdt.get("free")
    if free is not None:
        return float(free)
    return 0.0


def count_open_positions(exchange: ccxt.binanceusdm) -> int:
    positions = exchange.fetch_positions()
    return sum(1 for p in positions if abs(float(p.get("contracts") or 0)) > 0)


def has_position_on_symbol(exchange: ccxt.binanceusdm, symbol: str) -> bool:
    ccxt_symbol = settings.to_ccxt_symbol(symbol)
    positions = exchange.fetch_positions([ccxt_symbol])
    for pos in positions:
        if abs(float(pos.get("contracts") or 0)) > 0:
            return True
    return False


def compute_levels(entry: float, atr: float, side: Side) -> tuple[float, float]:
    stop_distance = atr * settings.ATR_STOP_MULTIPLIER
    tp_distance = stop_distance * settings.REWARD_RISK_RATIO

    if side == Side.LONG:
        stop = entry - stop_distance
        take_profit = entry + tp_distance
    else:
        stop = entry + stop_distance
        take_profit = entry - tp_distance

    return stop, take_profit


def calculate_size(equity: float, entry: float, stop: float) -> float | None:
    if entry <= 0:
        logger.debug("Size calc rejected: entry price <= 0")
        return None
    if equity <= 0:
        logger.warning("Size calc rejected: equity is %.2f USDT", equity)
        return None

    stop_distance = abs(entry - stop)
    if stop_distance <= 0:
        logger.debug("Size calc rejected: stop distance is zero")
        return None

    if settings.FIXED_TRADE_USDT is not None:
        notional = float(settings.FIXED_TRADE_USDT)
        logger.debug("Using fixed notional %.2f USDT", notional)
    else:
        risk_amount = equity * (settings.RISK_PER_TRADE_PCT / 100.0)
        notional = risk_amount / (stop_distance / entry)
        logger.debug(
            "Risk-based size | equity=%.2f risk_pct=%.2f%% risk_usdt=%.2f notional=%.2f",
            equity,
            settings.RISK_PER_TRADE_PCT,
            risk_amount,
            notional,
        )

    if settings.MAX_TRADE_USDT is not None:
        capped = min(notional, float(settings.MAX_TRADE_USDT))
        if capped < notional:
            logger.debug("Notional capped %.2f -> %.2f (MAX_TRADE_USDT)", notional, capped)
        notional = capped

    if notional < settings.MIN_TRADE_USDT:
        logger.warning(
            "Trade notional %.2f below MIN_TRADE_USDT (%.2f); skipping.",
            notional,
            settings.MIN_TRADE_USDT,
        )
        return None

    contracts = notional / entry
    logger.debug("Final size %.6f contracts (notional=%.2f @ entry=%.4f)", contracts, notional, entry)
    return contracts


def can_open_new(exchange: ccxt.binanceusdm, symbol: str) -> bool:
    if count_open_positions(exchange) >= settings.MAX_OPEN_POSITIONS:
        logger.info("Max open positions (%s) reached.", settings.MAX_OPEN_POSITIONS)
        return False
    if has_position_on_symbol(exchange, symbol):
        logger.info("Already have an open position on %s.", symbol)
        return False
    return True
