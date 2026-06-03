import type { Exchange } from "@/lib/bot/scanner";
import type { MarketKind } from "@/lib/storage/types";

/** Normalize user input e.g. BTC/USDT -> BTCUSDT */
export function normalizeSymbolInput(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function toSpotCcxtSymbol(symbol: string): string {
  const normalized = normalizeSymbolInput(symbol);
  if (normalized.endsWith("USDT")) {
    const base = normalized.slice(0, -4);
    return `${base}/USDT`;
  }
  return normalized;
}

export function toFuturesCcxtSymbol(symbol: string): string {
  const normalized = normalizeSymbolInput(symbol);
  if (normalized.endsWith("USDT")) {
    const base = normalized.slice(0, -4);
    return `${base}/USDT:USDT`;
  }
  return normalized;
}

/** @deprecated Use toFuturesCcxtSymbol or resolveCcxtSymbol with market. */
export function toCcxtSymbol(symbol: string): string {
  return toFuturesCcxtSymbol(symbol);
}

export function baseAssetFromSymbol(symbol: string): string {
  const normalized = normalizeSymbolInput(symbol);
  return normalized.endsWith("USDT") ? normalized.slice(0, -4) : normalized;
}

/**
 * Resolve a user symbol (BTCUSDT) to a valid Binance CCXT symbol for spot or futures.
 */
export function resolveCcxtSymbol(
  exchange: Exchange,
  userSymbol: string,
  market: MarketKind,
): string | null {
  const normalized = normalizeSymbolInput(userSymbol);

  if (market === "spot") {
    const direct = toSpotCcxtSymbol(normalized);
    if (exchange.markets[direct]?.spot) return direct;

    for (const m of Object.values(exchange.markets)) {
      if (!m.spot || m.quote !== "USDT") continue;
      if ((m.id ?? "").toUpperCase() === normalized) return m.symbol;
    }
    return null;
  }

  const direct = toFuturesCcxtSymbol(normalized);
  if (exchange.markets[direct]) return direct;

  const base = baseAssetFromSymbol(normalized);
  for (const m of Object.values(exchange.markets)) {
    if (!m.swap || m.quote !== "USDT") continue;

    const id = (m.id ?? "").toUpperCase();
    if (id === normalized) return m.symbol;
    if (id === `1000${base}USDT`) return m.symbol;
    if (id === `${base}USDT`) return m.symbol;
  }

  return null;
}

export function displaySymbolFromCcxt(ccxtSymbol: string, exchange?: Exchange): string {
  const market = exchange?.markets[ccxtSymbol];
  if (market?.id) return market.id.toUpperCase();
  return ccxtSymbol.split(":")[0]?.replace("/", "") ?? ccxtSymbol;
}

export function listInvalidSymbols(
  exchange: Exchange,
  symbols: string[],
  market: MarketKind,
): string[] {
  return symbols.filter((s) => resolveCcxtSymbol(exchange, s, market) === null);
}

export function filterValidSymbols(
  exchange: Exchange,
  symbols: string[],
  market: MarketKind,
): string[] {
  return symbols.filter((s) => resolveCcxtSymbol(exchange, s, market) !== null);
}
