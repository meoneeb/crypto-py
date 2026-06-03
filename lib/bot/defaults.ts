import type { BotSettings } from "@/lib/storage/types";
import { syncMarketType } from "@/lib/bot/markets";

/** Shortest timeframe allowed for analysis and trading. */
export const MIN_TIMEFRAME = "1m";

export const TIMEFRAME_MINUTES: Record<string, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "1d": 1440,
};

export const DEFAULT_SETTINGS: BotSettings = {
  autoTradeEnabled: true,
  spotEnabled: true,
  futuresEnabled: true,
  marketType: "both",
  minTimeframe: "1m",
  timeframe: "5m",
  candleLookback: 100,
  tradingHoursEnabled: false,
  tradingHoursStart: "00:00",
  tradingHoursEnd: "23:59",
  riskPerTradePct: 1.0,
  maxOpenPositions: 3,
  leverage: 5,
  minTradeUsdt: 10.0,
  maxTradeUsdt: 100.0,
  fixedTradeUsdt: null,
  symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  emaFast: 20,
  emaSlow: 50,
  atrPeriod: 14,
  atrStopMultiplier: 1.0,
  rewardRiskRatio: 2.0,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
};

export function timeframeToMinutes(tf: string): number {
  const minutes = TIMEFRAME_MINUTES[tf];
  if (minutes === undefined) {
    throw new Error(`Unsupported timeframe: ${tf}`);
  }
  return minutes;
}

export function validateTimeframe(settings: BotSettings): void {
  const floorM = timeframeToMinutes(MIN_TIMEFRAME);
  const minM = Math.max(timeframeToMinutes(settings.minTimeframe), floorM);
  const tfM = timeframeToMinutes(settings.timeframe);
  if (tfM < minM) {
    throw new Error(
      `timeframe ${settings.timeframe} is shorter than minTimeframe ${settings.minTimeframe}`,
    );
  }
  if (tfM < floorM) {
    throw new Error(`timeframe must be at least ${MIN_TIMEFRAME}`);
  }
}

export function assertTimeframeAtLeast(timeframe: string, minimum = MIN_TIMEFRAME): void {
  const tfM = timeframeToMinutes(timeframe);
  const minM = timeframeToMinutes(minimum);
  if (tfM < minM) {
    throw new Error(`Timeframe ${timeframe} is below minimum ${minimum}`);
  }
}

export function isWithinTradingHours(settings: BotSettings, now = new Date()): boolean {
  if (!settings.tradingHoursEnabled) return true;

  const parse = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };

  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = parse(settings.tradingHoursStart);
  const end = parse(settings.tradingHoursEnd);

  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

export function mergeSettings(overrides: Partial<BotSettings> | null): BotSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(overrides ?? {}) };

  if (overrides?.spotEnabled === undefined && overrides?.futuresEnabled === undefined && overrides?.marketType) {
    if (merged.marketType === "spot") {
      merged.spotEnabled = true;
      merged.futuresEnabled = false;
    } else if (merged.marketType === "futures") {
      merged.spotEnabled = false;
      merged.futuresEnabled = true;
    } else {
      merged.spotEnabled = true;
      merged.futuresEnabled = true;
    }
  }

  if (merged.autoTradeEnabled === undefined) merged.autoTradeEnabled = true;
  if (merged.spotEnabled === undefined) merged.spotEnabled = true;
  if (merged.futuresEnabled === undefined) merged.futuresEnabled = true;

  merged.marketType = syncMarketType(merged);
  return merged;
}
