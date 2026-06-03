export type TradingMode = "demo" | "live";

export type MarketKind = "spot" | "futures";

/** Which markets the bot trades on each scan. */
export type MarketType = MarketKind | "both";

export type Side = "long" | "short";

export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface BotSettings {
  /** When false, scans run but orders are not placed. */
  autoTradeEnabled: boolean;
  spotEnabled: boolean;
  futuresEnabled: boolean;
  marketType: MarketType;
  minTimeframe: string;
  timeframe: string;
  candleLookback: number;
  tradingHoursEnabled: boolean;
  tradingHoursStart: string;
  tradingHoursEnd: string;
  riskPerTradePct: number;
  maxOpenPositions: number;
  leverage: number;
  minTradeUsdt: number;
  maxTradeUsdt: number | null;
  fixedTradeUsdt: number | null;
  symbols: string[];
  emaFast: number;
  emaSlow: number;
  atrPeriod: number;
  atrStopMultiplier: number;
  rewardRiskRatio: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
}

export interface BotState {
  lastSignals: Record<string, string>;
}

export interface TradeRecord {
  timestamp: string;
  mode: TradingMode;
  market: MarketKind;
  symbol: string;
  side: Side;
  entry: number;
  stop: number;
  takeProfit: number;
  size: number;
  signalType: string;
  orderId: string;
  pnl?: string;
  rsi?: number;
  action?: TradeAction;
  comment?: string;
}

export interface ScanLogEntry {
  timestamp: string;
  mode: TradingMode;
  source: "manual" | "auto";
  scanned: number;
  signals: number;
  entries: number;
  errors: number;
  durationMs: number;
  equity: number;
  openPositions: number;
  details?: string[];
  analyses?: SymbolAnalysis[];
}

/** Unified row for the trades / activity page. */
export interface TradeActivity {
  id: string;
  timestamp: string;
  kind: "executed" | "signal" | "skipped";
  market?: MarketKind;
  symbol: string;
  action?: TradeAction;
  side?: Side;
  rsi?: number;
  entry?: number;
  size?: number;
  stop?: number;
  takeProfit?: number;
  comment?: string;
  detail?: string;
}

export interface ScanResult {
  scanned: number;
  signals: number;
  entries: number;
  errors: number;
  durationMs: number;
  equity: number;
  openPositions: number;
  details: string[];
  analyses: SymbolAnalysis[];
}

export interface PositionInfo {
  market: MarketKind;
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  markPrice?: number;
  /** Position notional value in USDT */
  notionalUsdt?: number;
  returnUsdt?: number;
  returnPct?: number;
  timeframe?: string;
  openedAt?: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolAnalysis {
  market: MarketKind;
  symbol: string;
  close: number;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  atr: number;
  candleTimestamp: string;
  trend: "bullish" | "bearish" | "neutral";
  crossover: "long" | "short" | "none";
  action: TradeAction;
  comment: string;
}

export interface Signal {
  symbol: string;
  side: Side;
  entryPrice: number;
  atr: number;
  candleTimestamp: string;
  emaFast: number;
  emaSlow: number;
  rsi: number;
  action: TradeAction;
  comment: string;
}
