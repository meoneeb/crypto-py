import type { BotSettings, MarketKind, MarketType } from "@/lib/storage/types";

export function syncMarketType(settings: Pick<BotSettings, "spotEnabled" | "futuresEnabled">): MarketType {
  if (settings.spotEnabled && settings.futuresEnabled) return "both";
  if (settings.spotEnabled) return "spot";
  if (settings.futuresEnabled) return "futures";
  return "both";
}

export function activeMarketKinds(settings: BotSettings): MarketKind[] {
  const kinds: MarketKind[] = [];
  if (settings.spotEnabled) kinds.push("spot");
  if (settings.futuresEnabled) kinds.push("futures");

  if (kinds.length) return kinds;

  // Legacy fallback from marketType
  if (settings.marketType === "both") return ["spot", "futures"];
  return [settings.marketType];
}

export function marketsSummary(settings: BotSettings): string {
  const kinds = activeMarketKinds(settings);
  if (!kinds.length) return "None";
  return kinds.map((k) => (k === "spot" ? "Spot" : "Futures")).join(" + ");
}

export function signalStateKey(market: MarketKind, symbol: string): string {
  return `${market}:${symbol}`;
}

export function marketLabel(market: MarketKind): string {
  return market === "spot" ? "Spot" : "Futures";
}
