import { analyzeSymbol } from "@/lib/bot/analysis";
import { executeSignal, setSymbolLeverage } from "@/lib/bot/broker";
import { DEFAULT_SETTINGS, assertTimeframeAtLeast } from "@/lib/bot/defaults";
import { mapExchangePositions } from "@/lib/bot/futuresAccount";
import { computeLevels } from "@/lib/bot/risk";
import { createExchangeFromCredentials, createPublicFuturesExchange, type Exchange } from "@/lib/bot/scanner";
import { resolveCcxtSymbol, displaySymbolFromCcxt } from "@/lib/bot/symbols";
import type { ApiCredentials } from "@/lib/auth/session";
import type { TradingMode } from "@/lib/bot/config";
import type { BotSettings, Candle, Side, TradeAction } from "@/lib/storage/types";

/** Futures desk timeframes (minimum 1m). */
export const DESK_TIMEFRAME_OPTIONS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
] as const;

export type DeskTimeframe = (typeof DESK_TIMEFRAME_OPTIONS)[number];

export interface DeskPosition {
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  markPrice?: number;
  notionalUsdt?: number;
  returnUsdt?: number;
  returnPct?: number;
  timeframe?: string;
  openedAt?: string;
}

export interface FuturesSignal {
  symbol: string;
  timeframe: string;
  signal: TradeAction;
  signalColor: "green" | "red";
  rsi: number;
  close: number;
  atr: number;
  canExecute: boolean;
  canClose: boolean;
}

export interface FuturesContext {
  credentials: ApiCredentials;
  mode: TradingMode;
}

function deskSettings(timeframe: string): BotSettings {
  return { ...DEFAULT_SETTINGS, timeframe, futuresEnabled: true };
}

async function createDeskExchange(ctx: FuturesContext): Promise<Exchange> {
  return createExchangeFromCredentials(ctx.credentials, ctx.mode, "futures");
}

async function fetchDeskCandles(
  exchange: Exchange,
  symbol: string,
  timeframe: string,
  lookback: number,
): Promise<Candle[]> {
  assertTimeframeAtLeast(timeframe);

  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "futures");
  if (!ccxtSymbol) throw new Error(`Invalid futures symbol: ${symbol}`);

  const ohlcv = await exchange.fetchOHLCV(ccxtSymbol, timeframe, undefined, lookback);
  return ohlcv.map((row) => ({
    timestamp: row[0] as number,
    open: row[1] as number,
    high: row[2] as number,
    low: row[3] as number,
    close: row[4] as number,
    volume: row[5] as number,
  }));
}

/** Futures desk always returns BUY or SELL from trend + RSI (crossover boosts confidence). */
export function resolveDeskTradeSignal(
  analysis: NonNullable<ReturnType<typeof analyzeSymbol>>,
  settings: BotSettings,
): TradeAction {
  if (analysis.crossover === "long" && analysis.rsi < settings.rsiOverbought) {
    return "BUY";
  }
  if (analysis.crossover === "short" && analysis.rsi > settings.rsiOversold) {
    return "SELL";
  }

  if (analysis.emaFast > analysis.emaSlow) {
    return analysis.rsi >= settings.rsiOverbought ? "SELL" : "BUY";
  }
  if (analysis.emaFast < analysis.emaSlow) {
    return analysis.rsi <= settings.rsiOversold ? "BUY" : "SELL";
  }

  return analysis.rsi >= 50 ? "BUY" : "SELL";
}

async function hasOpenSymbolPosition(exchange: Exchange, symbol: string): Promise<boolean> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "futures");
  if (!ccxtSymbol) return false;
  const positions = await exchange.fetchPositions([ccxtSymbol]);
  return positions.some((p) => Math.abs(Number(p.contracts ?? 0)) > 0);
}

export async function getFuturesSignal(
  symbol: string,
  timeframe: string,
  ctx?: FuturesContext | null,
): Promise<FuturesSignal> {
  const settings = deskSettings(timeframe);
  const exchange = ctx
    ? await createDeskExchange(ctx)
    : await createPublicFuturesExchange();

  const candles = await fetchDeskCandles(exchange, symbol, timeframe, settings.candleLookback);
  const analysis = analyzeSymbol(candles, symbol, settings, "futures");

  if (!analysis) {
    throw new Error("Not enough candle data for analysis. Try a longer timeframe.");
  }

  const tradeSignal = resolveDeskTradeSignal(analysis, settings);

  let canExecute = false;
  let canClose = false;
  if (ctx) {
    const hasPosition = await hasOpenSymbolPosition(exchange, symbol);
    canExecute = !hasPosition;
    canClose = hasPosition;
  }

  return {
    symbol,
    timeframe,
    signal: tradeSignal,
    signalColor: tradeSignal === "BUY" ? "green" : "red",
    rsi: analysis.rsi,
    close: analysis.close,
    atr: analysis.atr,
    canExecute,
    canClose,
  };
}

/** Authenticated signal (includes position flags). */
export async function analyzeFuturesDesk(
  ctx: FuturesContext,
  symbol: string,
  timeframe: string,
): Promise<FuturesSignal> {
  return getFuturesSignal(symbol, timeframe, ctx);
}

export async function fetchFuturesAccountState(ctx: FuturesContext): Promise<{
  positions: DeskPosition[];
}> {
  const exchange = await createDeskExchange(ctx);
  const positions = await mapExchangePositions(exchange);
  return { positions };
}

export async function executeFuturesDesk(
  ctx: FuturesContext,
  symbol: string,
  timeframe: string,
  amountUsdt: number,
): Promise<{
  ok: true;
  orderId: string;
  signal: TradeAction;
  fillPrice: number;
  warnings?: string[];
}> {
  const settings = deskSettings(timeframe);
  const deskSignal = await getFuturesSignal(symbol, timeframe, ctx);

  if (!deskSignal.canExecute) {
    throw new Error(
      `Cannot open new position: you already have exposure on ${symbol}. Close it first or pick another symbol.`,
    );
  }
  if (deskSignal.signal !== "BUY" && deskSignal.signal !== "SELL") {
    throw new Error("Invalid trade signal.");
  }

  if (amountUsdt < settings.minTradeUsdt) {
    throw new Error(`Amount must be at least ${settings.minTradeUsdt} USDT.`);
  }

  const exchange = await createDeskExchange(ctx);
  await setSymbolLeverage(exchange, symbol, settings.leverage);

  const side = deskSignal.signal === "BUY" ? "long" : "short";
  const size = amountUsdt / deskSignal.close;
  const { stop, takeProfit } = computeLevels(deskSignal.close, deskSignal.atr, side, settings);
  const stopDistance = Math.abs(deskSignal.close - stop);
  const tpDistance = Math.abs(takeProfit - deskSignal.close);

  const result = await executeSignal(
    exchange,
    "futures",
    symbol,
    side,
    deskSignal.signal,
    size,
    stopDistance,
    tpDistance,
  );

  if (!result) {
    throw new Error("Order failed unexpectedly.");
  }

  return {
    ok: true,
    orderId: result.entry.id ?? "",
    signal: deskSignal.signal,
    fillPrice: result.fillPrice,
    warnings: result.warnings,
  };
}

export async function closeFuturesDeskPosition(
  ctx: FuturesContext,
  symbol: string,
): Promise<{ ok: true; orderId: string; side: Side }> {
  const exchange = await createDeskExchange(ctx);

  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "futures");
  if (!ccxtSymbol) throw new Error(`Invalid symbol: ${symbol}`);

  const positions = await exchange.fetchPositions([ccxtSymbol]);
  const pos = positions.find((p) => Math.abs(Number(p.contracts ?? 0)) > 0);
  if (!pos) throw new Error(`No open position on ${symbol}.`);

  const contracts = Math.abs(Number(pos.contracts ?? 0));
  const side = pos.side === "long" ? "long" : "short";
  const close = side === "long" ? "sell" : "buy";

  try {
    const openOrders = await exchange.fetchOpenOrders(ccxtSymbol);
    for (const o of openOrders) {
      if (o.id) await exchange.cancelOrder(o.id, ccxtSymbol);
    }
  } catch {
    /* continue */
  }

  let order;
  try {
    order = await exchange.createOrder(ccxtSymbol, "market", close, contracts, undefined, {
      reduceOnly: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Close order failed: ${msg}`);
  }

  return { ok: true, orderId: order.id ?? "", side };
}

export async function listFuturesSymbols(query?: string): Promise<string[]> {
  const exchange = await createPublicFuturesExchange();
  const symbols: string[] = [];

  for (const market of Object.values(exchange.markets)) {
    if (!market.swap || market.quote !== "USDT" || !market.active) continue;
    const id = (market.id ?? "").toUpperCase();
    if (!id.endsWith("USDT")) continue;
    symbols.push(id);
  }

  const unique = [...new Set(symbols)].sort();
  const q = (query ?? "").trim().toUpperCase();
  if (!q) return unique.slice(0, 100);
  return unique.filter((s) => s.includes(q)).slice(0, 80);
}

export { displaySymbolFromCcxt };
