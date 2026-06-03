import type { Exchange } from "@/lib/bot/scanner";
import { baseAssetFromSymbol, resolveCcxtSymbol } from "@/lib/bot/symbols";
import type { BotSettings, MarketKind, Side, Signal } from "@/lib/storage/types";

export async function getEquity(exchange: Exchange, market: MarketKind): Promise<number> {
  const balance = await exchange.fetchBalance();
  const usdt = (balance.USDT ?? {}) as { total?: number; free?: number };
  if (market === "spot" && usdt.free !== undefined) return Number(usdt.free);
  if (usdt.total !== undefined) return Number(usdt.total);
  if (usdt.free !== undefined) return Number(usdt.free);
  return 0;
}

export async function getSpotHoldingAmount(
  exchange: Exchange,
  symbol: string,
): Promise<number> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "spot");
  if (!ccxtSymbol) return 0;

  const base = baseAssetFromSymbol(symbol);
  const balance = await exchange.fetchBalance();
  const asset = (balance[base] ?? {}) as { free?: number; total?: number };
  return Number(asset.free ?? asset.total ?? 0);
}

export async function countOpenPositions(
  exchange: Exchange,
  market: MarketKind,
  settings: BotSettings,
): Promise<number> {
  if (market === "futures") {
    const positions = await exchange.fetchPositions();
    return positions.filter((p: { contracts?: number }) => Math.abs(Number(p.contracts ?? 0)) > 0)
      .length;
  }

  let count = 0;
  for (const symbol of settings.symbols) {
    const amount = await getSpotHoldingAmount(exchange, symbol);
    if (amount > 0) count += 1;
  }
  return count;
}

export async function hasOpenExposure(
  exchange: Exchange,
  market: MarketKind,
  symbol: string,
): Promise<boolean> {
  if (market === "futures") {
    const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "futures");
    if (!ccxtSymbol) return false;
    const positions = await exchange.fetchPositions([ccxtSymbol]);
    return positions.some((p: { contracts?: number }) => Math.abs(Number(p.contracts ?? 0)) > 0);
  }

  return (await getSpotHoldingAmount(exchange, symbol)) > 0;
}

export function computeLevels(
  entry: number,
  atrValue: number,
  side: Side,
  settings: BotSettings,
): { stop: number; takeProfit: number } {
  const stopDistance = atrValue * settings.atrStopMultiplier;
  const tpDistance = stopDistance * settings.rewardRiskRatio;

  if (side === "long") {
    return { stop: entry - stopDistance, takeProfit: entry + tpDistance };
  }
  return { stop: entry + stopDistance, takeProfit: entry - tpDistance };
}

export function calculateSize(
  equity: number,
  entry: number,
  stop: number,
  settings: BotSettings,
): number | null {
  if (entry <= 0 || equity <= 0) return null;

  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) return null;

  let notional: number;
  if (settings.fixedTradeUsdt !== null) {
    notional = settings.fixedTradeUsdt;
  } else {
    const riskAmount = equity * (settings.riskPerTradePct / 100);
    notional = riskAmount / (stopDistance / entry);
  }

  if (settings.maxTradeUsdt !== null) {
    notional = Math.min(notional, settings.maxTradeUsdt);
  }

  if (notional < settings.minTradeUsdt) return null;
  return notional / entry;
}

export async function canExecuteSignal(
  exchange: Exchange,
  market: MarketKind,
  symbol: string,
  signal: Signal,
  settings: BotSettings,
): Promise<boolean> {
  if ((await countOpenPositions(exchange, market, settings)) >= settings.maxOpenPositions) {
    return false;
  }

  if (market === "spot") {
    const holding = await getSpotHoldingAmount(exchange, symbol);
    if (signal.action === "BUY") return holding <= 0;
    if (signal.action === "SELL") return holding > 0;
    return false;
  }

  if (await hasOpenExposure(exchange, market, symbol)) return false;
  return true;
}
