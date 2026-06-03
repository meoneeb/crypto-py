import type { BotSettings, Candle, MarketKind, Side, Signal, SymbolAnalysis, TradeAction } from "@/lib/storage/types";
import { atr, ema, rsi, rsiZone } from "@/lib/bot/indicators";

function trendLabel(emaFast: number, emaSlow: number): SymbolAnalysis["trend"] {
  if (emaFast > emaSlow) return "bullish";
  if (emaFast < emaSlow) return "bearish";
  return "neutral";
}

function buildComment(
  action: TradeAction,
  crossover: SymbolAnalysis["crossover"],
  trend: SymbolAnalysis["trend"],
  rsiValue: number,
  zone: string,
  settings: BotSettings,
  market: MarketKind,
): string {
  const rsiPart = `RSI ${rsiValue.toFixed(1)} (${zone})`;

  if (crossover === "long") {
    if (action === "BUY") {
      return `EMA${settings.emaFast} crossed above EMA${settings.emaSlow}; ${rsiPart}. Entry allowed.`;
    }
    return `EMA bullish crossover but ${rsiPart} — overbought filter blocks long.`;
  }

  if (crossover === "short") {
    if (action === "SELL") {
      if (market === "spot") {
        return `EMA${settings.emaFast} crossed below EMA${settings.emaSlow}; ${rsiPart}. Sell spot holdings.`;
      }
      return `EMA${settings.emaFast} crossed below EMA${settings.emaSlow}; ${rsiPart}. Short entry allowed.`;
    }
    return `EMA bearish crossover but ${rsiPart} — oversold filter blocks short.`;
  }

  if (trend === "bullish") {
    return `${trend} trend; ${rsiPart}; no new crossover — hold / wait for pullbacks.`;
  }
  if (trend === "bearish") {
    return `${trend} trend; ${rsiPart}; no new crossover — hold / wait for bounces.`;
  }

  return `EMAs flat; ${rsiPart}; no trade signal.`;
}

function resolveAction(
  crossover: SymbolAnalysis["crossover"],
  rsiValue: number,
  settings: BotSettings,
): TradeAction {
  if (crossover === "long") {
    if (rsiValue >= settings.rsiOverbought) return "HOLD";
    return "BUY";
  }
  if (crossover === "short") {
    if (rsiValue <= settings.rsiOversold) return "HOLD";
    return "SELL";
  }
  return "HOLD";
}

export function analyzeSymbol(
  candles: Candle[],
  symbol: string,
  settings: BotSettings,
  market: MarketKind,
): SymbolAnalysis | null {
  const minLen = Math.max(settings.emaSlow, settings.atrPeriod, settings.rsiPeriod) + 2;
  if (candles.length < minLen) return null;

  const closes = candles.map((c) => c.close);
  const emaFastSeries = ema(closes, settings.emaFast);
  const emaSlowSeries = ema(closes, settings.emaSlow);
  const atrSeries = atr(candles, settings.atrPeriod);
  const rsiSeries = rsi(closes, settings.rsiPeriod);

  const prevIdx = candles.length - 3;
  const currIdx = candles.length - 2;
  const prevFast = emaFastSeries[prevIdx];
  const prevSlow = emaSlowSeries[prevIdx];
  const currFast = emaFastSeries[currIdx];
  const currSlow = emaSlowSeries[currIdx];
  const currAtr = atrSeries[currIdx];
  const currRsi = rsiSeries[currIdx];

  if ([currFast, currSlow, currAtr, currRsi].some((v) => Number.isNaN(v))) return null;

  let crossover: SymbolAnalysis["crossover"] = "none";
  if (prevFast <= prevSlow && currFast > currSlow) crossover = "long";
  else if (prevFast >= prevSlow && currFast < currSlow) crossover = "short";

  const trend = trendLabel(currFast, currSlow);
  const zone = rsiZone(currRsi, settings.rsiOversold, settings.rsiOverbought);
  const action = resolveAction(crossover, currRsi, settings);
  const comment = buildComment(action, crossover, trend, currRsi, zone, settings, market);

  return {
    market,
    symbol,
    close: candles[currIdx].close,
    rsi: currRsi,
    emaFast: currFast,
    emaSlow: currSlow,
    atr: currAtr,
    candleTimestamp: new Date(candles[currIdx].timestamp).toISOString(),
    trend,
    crossover,
    action,
    comment,
  };
}

export function formatAnalysisLine(analysis: SymbolAnalysis): string {
  const prefix = analysis.market === "spot" ? "[Spot]" : "[Futures]";
  return `${prefix} ${analysis.symbol} | RSI ${analysis.rsi.toFixed(1)} | ${analysis.action} | ${analysis.comment}`;
}

export function detectCrossover(
  candles: Candle[],
  symbol: string,
  settings: BotSettings,
  market: MarketKind,
): Signal | null {
  const analysis = analyzeSymbol(candles, symbol, settings, market);
  if (!analysis) return null;

  if (analysis.action === "BUY" && analysis.crossover === "long") {
    return {
      symbol,
      side: "long" as Side,
      entryPrice: analysis.close,
      atr: analysis.atr,
      candleTimestamp: analysis.candleTimestamp,
      emaFast: analysis.emaFast,
      emaSlow: analysis.emaSlow,
      rsi: analysis.rsi,
      action: analysis.action,
      comment: analysis.comment,
    };
  }

  if (analysis.action === "SELL" && analysis.crossover === "short") {
    return {
      symbol,
      side: "short" as Side,
      entryPrice: analysis.close,
      atr: analysis.atr,
      candleTimestamp: analysis.candleTimestamp,
      emaFast: analysis.emaFast,
      emaSlow: analysis.emaSlow,
      rsi: analysis.rsi,
      action: analysis.action,
      comment: analysis.comment,
    };
  }

  return null;
}
