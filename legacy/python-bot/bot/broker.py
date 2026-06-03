"""Order placement and position management."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import ccxt

from bot import settings
from bot.strategy import Side

logger = logging.getLogger(__name__)


@dataclass
class Position:
    symbol: str
    side: Side
    size: float
    entry_price: float
    stop: float
    take_profit: float


def setup_leverage(exchange: ccxt.binanceusdm, symbols: list[str] | None = None) -> None:
    symbols = symbols or settings.SYMBOLS
    for symbol in symbols:
        ccxt_symbol = settings.to_ccxt_symbol(symbol)
        try:
            exchange.set_leverage(settings.LEVERAGE, ccxt_symbol)
            logger.info("Set leverage %sx on %s", settings.LEVERAGE, symbol)
        except Exception as exc:
            logger.warning("Could not set leverage on %s: %s", symbol, exc)


def _order_side(side: Side) -> str:
    return "buy" if side == Side.LONG else "sell"


def _close_side(side: Side) -> str:
    return "sell" if side == Side.LONG else "buy"


def _amount_to_precision(exchange: ccxt.binanceusdm, symbol: str, amount: float) -> float:
    ccxt_symbol = settings.to_ccxt_symbol(symbol)
    return float(exchange.amount_to_precision(ccxt_symbol, amount))


def _price_to_precision(exchange: ccxt.binanceusdm, symbol: str, price: float) -> float:
    ccxt_symbol = settings.to_ccxt_symbol(symbol)
    return float(exchange.price_to_precision(ccxt_symbol, price))


def open_position(
    exchange: ccxt.binanceusdm,
    symbol: str,
    side: Side,
    size: float,
    stop: float,
    take_profit: float,
) -> dict | None:
    ccxt_symbol = settings.to_ccxt_symbol(symbol)
    amount = _amount_to_precision(exchange, symbol, size)
    stop_price = _price_to_precision(exchange, symbol, stop)
    tp_price = _price_to_precision(exchange, symbol, take_profit)

    if amount <= 0:
        logger.warning("Invalid amount for %s: %s", symbol, amount)
        return None

    try:
        entry_order = exchange.create_order(
            ccxt_symbol,
            "market",
            _order_side(side),
            amount,
        )
        logger.info(
            "Opened %s %s size=%s entry_order=%s",
            side.value,
            symbol,
            amount,
            entry_order.get("id"),
        )

        close_side = _close_side(side)
        sl_order = exchange.create_order(
            ccxt_symbol,
            "STOP_MARKET",
            close_side,
            amount,
            None,
            {"stopPrice": stop_price, "reduceOnly": True},
        )
        tp_order = exchange.create_order(
            ccxt_symbol,
            "TAKE_PROFIT_MARKET",
            close_side,
            amount,
            None,
            {"stopPrice": tp_price, "reduceOnly": True},
        )
        logger.info(
            "Attached SL=%s (id=%s) TP=%s (id=%s) for %s",
            stop_price,
            sl_order.get("id"),
            tp_price,
            tp_order.get("id"),
            symbol,
        )
        return {
            "entry": entry_order,
            "stop_loss": sl_order,
            "take_profit": tp_order,
            "amount": amount,
        }
    except ccxt.BaseError as exc:
        logger.error("Failed to open position on %s: %s", symbol, exc)
        return None


def close_position(exchange: ccxt.binanceusdm, symbol: str, side: Side, size: float) -> dict | None:
    ccxt_symbol = settings.to_ccxt_symbol(symbol)
    amount = _amount_to_precision(exchange, symbol, size)
    try:
        order = exchange.create_order(
            ccxt_symbol,
            "market",
            _close_side(side),
            amount,
            None,
            {"reduceOnly": True},
        )
        logger.info("Closed position on %s order=%s", symbol, order.get("id"))
        return order
    except ccxt.BaseError as exc:
        logger.error("Failed to close position on %s: %s", symbol, exc)
        return None


def sync_positions(exchange: ccxt.binanceusdm) -> list[Position]:
    positions: list[Position] = []
    raw = exchange.fetch_positions()
    for pos in raw:
        contracts = float(pos.get("contracts") or 0)
        if abs(contracts) <= 0:
            continue

        ccxt_symbol = pos.get("symbol") or ""
        symbol = ccxt_symbol.split(":")[0].replace("/", "") if ccxt_symbol else ""
        side = Side.LONG if pos.get("side") == "long" else Side.SHORT
        entry = float(pos.get("entryPrice") or pos.get("info", {}).get("entryPrice") or 0)

        positions.append(
            Position(
                symbol=symbol,
                side=side,
                size=abs(contracts),
                entry_price=entry,
                stop=0.0,
                take_profit=0.0,
            )
        )
    return positions


def update_stops(exchange: ccxt.binanceusdm, positions: list[Position]) -> None:
    """Log open protective orders; re-placement can be added if needed."""
    for pos in positions:
        ccxt_symbol = settings.to_ccxt_symbol(pos.symbol)
        try:
            open_orders = exchange.fetch_open_orders(ccxt_symbol)
            has_sl = any(o.get("type", "").upper().startswith("STOP") for o in open_orders)
            has_tp = any("TAKE_PROFIT" in o.get("type", "").upper() for o in open_orders)
            if not has_sl or not has_tp:
                logger.warning(
                    "%s missing protective orders (SL=%s TP=%s)",
                    pos.symbol,
                    has_sl,
                    has_tp,
                )
        except ccxt.BaseError as exc:
            logger.warning("Could not fetch open orders for %s: %s", pos.symbol, exc)
