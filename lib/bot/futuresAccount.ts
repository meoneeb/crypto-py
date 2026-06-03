import type { Exchange } from "@/lib/bot/scanner";
import { displaySymbolFromCcxt } from "@/lib/bot/symbols";
import type { DeskPosition } from "@/lib/bot/futuresDesk";

export async function mapExchangePositions(exchange: Exchange): Promise<DeskPosition[]> {
  const positions: DeskPosition[] = [];

  for (const pos of await exchange.fetchPositions()) {
    const contracts = Math.abs(Number(pos.contracts ?? 0));
    if (contracts <= 0) continue;

    const ccxtSymbol = String(pos.symbol ?? "");
    const info = pos.info as { markPrice?: string; unRealizedProfit?: string } | undefined;
    const markPrice = Number(pos.markPrice ?? info?.markPrice ?? 0);
    const entryPrice = Number(pos.entryPrice ?? 0);
    const returnUsdt = Number(pos.unrealizedPnl ?? info?.unRealizedProfit ?? 0);
    const returnPct = Number(pos.percentage ?? 0);
    let notionalUsdt = Number(pos.notional ?? 0);
    if (notionalUsdt <= 0 && markPrice > 0) notionalUsdt = contracts * markPrice;
    else if (notionalUsdt <= 0 && entryPrice > 0) notionalUsdt = contracts * entryPrice;

    positions.push({
      symbol: displaySymbolFromCcxt(ccxtSymbol, exchange),
      side: pos.side === "long" ? "long" : "short",
      size: contracts,
      entryPrice,
      markPrice: markPrice > 0 ? markPrice : undefined,
      notionalUsdt: notionalUsdt > 0 ? notionalUsdt : undefined,
      returnUsdt,
      returnPct,
    });
  }

  return positions;
}
