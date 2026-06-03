import ccxt, { type Exchange as CcxtExchange } from "ccxt";

import type { ApiCredentials } from "@/lib/auth/session";
import { activeCredentials, type BotConfig, type TradingMode } from "@/lib/bot/config";
import { activeMarketKinds } from "@/lib/bot/markets";
import { resolveCcxtSymbol } from "@/lib/bot/symbols";
import type { BotSettings, Candle, MarketKind } from "@/lib/storage/types";

export type Exchange = CcxtExchange;

function buildExchange(
  apiKey: string,
  secret: string,
  market: MarketKind,
  mode: TradingMode,
): Exchange {
  const exchange =
    market === "futures"
      ? new ccxt.binanceusdm({
          apiKey,
          secret,
          enableRateLimit: true,
          options: { defaultType: "future" },
        })
      : new ccxt.binance({
          apiKey,
          secret,
          enableRateLimit: true,
          options: { defaultType: "spot" },
        });

  if (mode === "demo") {
    exchange.enableDemoTrading(true);
  }

  return exchange;
}

export async function createPublicFuturesExchange(): Promise<Exchange> {
  const exchange = new ccxt.binanceusdm({
    enableRateLimit: true,
    options: { defaultType: "future" },
  });
  await exchange.loadMarkets();
  return exchange;
}

export async function createExchangeFromCredentials(
  credentials: ApiCredentials,
  mode: TradingMode,
  market: MarketKind = "futures",
): Promise<Exchange> {
  const exchange = buildExchange(credentials.apiKey, credentials.secret, market, mode);
  await exchange.loadMarkets();
  return exchange;
}

export async function createExchange(config: BotConfig, market: MarketKind): Promise<Exchange> {
  const { apiKey, secret } = activeCredentials(config);
  return createExchangeFromCredentials({ apiKey, secret }, config.tradingMode, market);
}

export async function createExchanges(
  config: BotConfig,
  settings: BotSettings,
): Promise<Partial<Record<MarketKind, Exchange>>> {
  const result: Partial<Record<MarketKind, Exchange>> = {};
  for (const market of activeMarketKinds(settings)) {
    result[market] = await createExchange(config, market);
  }
  return result;
}

export async function fetchCandles(
  exchange: Exchange,
  symbol: string,
  settings: BotSettings,
  market: MarketKind,
): Promise<Candle[]> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, market);
  if (!ccxtSymbol) {
    throw new ccxt.BadSymbol(`${symbol} is not a valid Binance ${market} symbol`);
  }

  const ohlcv = await exchange.fetchOHLCV(
    ccxtSymbol,
    settings.timeframe,
    undefined,
    settings.candleLookback,
  );

  return ohlcv.map((row) => ({
    timestamp: row[0] as number,
    open: row[1] as number,
    high: row[2] as number,
    low: row[3] as number,
    close: row[4] as number,
    volume: row[5] as number,
  }));
}

export async function fetchAllCandles(
  exchange: Exchange,
  settings: BotSettings,
  market: MarketKind,
): Promise<Record<string, Candle[]>> {
  const result: Record<string, Candle[]> = {};
  for (const symbol of settings.symbols) {
    try {
      result[symbol] = await fetchCandles(exchange, symbol, settings, market);
    } catch (error) {
      console.error(`Failed to fetch ${market} candles for ${symbol}:`, error);
    }
  }
  return result;
}

/** Prefer futures candles for chart when both markets are enabled. */
export function chartMarket(settings: BotSettings): MarketKind {
  const kinds = activeMarketKinds(settings);
  if (kinds.includes("futures")) return "futures";
  return kinds[0] ?? "futures";
}
