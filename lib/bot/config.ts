export type TradingMode = "demo" | "live";

export interface BotConfig {
  tradingMode: TradingMode;
  demoApiKey: string;
  demoApiSecret: string;
  liveApiKey: string;
  liveApiSecret: string;
  allowLive: boolean;
}

function envBool(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function loadConfig(): BotConfig {
  const tradingMode = (process.env.TRADING_MODE ?? "demo").trim().toLowerCase() as TradingMode;
  return {
    tradingMode: tradingMode === "live" ? "live" : "demo",
    demoApiKey: (process.env.BINANCE_DEMO_API_KEY ?? "").trim(),
    demoApiSecret: (process.env.BINANCE_DEMO_API_SECRET ?? "").trim(),
    liveApiKey: (process.env.BINANCE_LIVE_API_KEY ?? "").trim(),
    liveApiSecret: (process.env.BINANCE_LIVE_API_SECRET ?? "").trim(),
    allowLive: envBool("ALLOW_LIVE"),
  };
}

export function validateConfig(config: BotConfig): void {
  if (config.tradingMode === "live" && !config.allowLive) {
    throw new Error("TRADING_MODE=live but ALLOW_LIVE is not true.");
  }

  const key = config.tradingMode === "demo" ? config.demoApiKey : config.liveApiKey;
  const secret = config.tradingMode === "demo" ? config.demoApiSecret : config.liveApiSecret;
  const label = config.tradingMode === "demo" ? "BINANCE_DEMO" : "BINANCE_LIVE";

  if (!key || !secret) {
    throw new Error(`Missing ${label}_API_KEY or ${label}_API_SECRET.`);
  }
}

export function activeCredentials(config: BotConfig): { apiKey: string; secret: string } {
  if (config.tradingMode === "demo") {
    return { apiKey: config.demoApiKey, secret: config.demoApiSecret };
  }
  return { apiKey: config.liveApiKey, secret: config.liveApiSecret };
}
