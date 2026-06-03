import type { BotSettings, Candle, MarketKind, SymbolAnalysis } from "@/lib/storage/types";
import { analyzeSymbol } from "@/lib/bot/analysis";
import { atr, ema, rsi } from "@/lib/bot/indicators";

export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  emaFast: number | null;
  emaSlow: number | null;
  rsi: number | null;
}

export interface ChartPayload {
  symbol: string;
  timeframe: string;
  bars: ChartBar[];
  analysis: SymbolAnalysis | null;
  updatedAt: string;
}

export function buildChartPayload(
  candles: Candle[],
  symbol: string,
  settings: BotSettings,
  market: MarketKind,
): ChartPayload {
  const closes = candles.map((c) => c.close);
  const emaFastSeries = ema(closes, settings.emaFast);
  const emaSlowSeries = ema(closes, settings.emaSlow);
  const rsiSeries = rsi(closes, settings.rsiPeriod);

  const bars: ChartBar[] = candles.map((c, i) => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    emaFast: Number.isNaN(emaFastSeries[i]) ? null : emaFastSeries[i],
    emaSlow: Number.isNaN(emaSlowSeries[i]) ? null : emaSlowSeries[i],
    rsi: Number.isNaN(rsiSeries[i]) ? null : rsiSeries[i],
  }));

  return {
    symbol,
    timeframe: settings.timeframe,
    bars,
    analysis: analyzeSymbol(candles, symbol, settings, market),
    updatedAt: new Date().toISOString(),
  };
}
