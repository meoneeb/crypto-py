import type { DeskPosition } from "@/lib/bot/futuresDesk";
import type { PositionInfo } from "@/lib/storage/types";

type Row = DeskPosition | PositionInfo;

function rowMarket(p: Row): PositionInfo["market"] | undefined {
  return "market" in p ? p.market : undefined;
}

function formatReturn(usdt?: number, pct?: number): { text: string; className: string } {
  if (usdt === undefined && pct === undefined) {
    return { text: "—", className: "text-zinc-500" };
  }
  const value = usdt ?? 0;
  const pctStr = pct !== undefined && !Number.isNaN(pct) ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : "";
  const text = `${value >= 0 ? "+" : ""}${value.toFixed(2)} USDT${pctStr}`;
  const className = value >= 0 ? "text-emerald-400" : "text-red-400";
  return { text, className };
}

export function OpenPositionsTable({
  positions,
  highlightSymbol,
}: {
  positions: Row[];
  highlightSymbol?: string;
}) {
  if (!positions.length) {
    return <p className="text-sm text-zinc-500">No open futures positions.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
          <tr>
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Side</th>
            <th className="px-3 py-2 font-medium">TF</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Entry</th>
            <th className="px-3 py-2 font-medium">Mark</th>
            <th className="px-3 py-2 font-medium">Return</th>
            <th className="px-3 py-2 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const ret = formatReturn(p.returnUsdt, p.returnPct);
            const market = rowMarket(p);
            return (
              <tr
                key={`${market ?? "futures"}-${p.symbol}-${p.side}`}
                className={`border-t border-zinc-800/80 ${
                  highlightSymbol && p.symbol === highlightSymbol
                    ? "bg-sky-950/25"
                    : "bg-zinc-900/40"
                }`}
              >
                <td className="px-3 py-2 font-medium">
                  {p.symbol}
                  {market && market !== "futures" ? (
                    <span className="ml-1 text-xs text-zinc-500">{market}</span>
                  ) : null}
                </td>
                <td
                  className={`px-3 py-2 uppercase ${
                    p.side === "long" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {p.side}
                </td>
                <td className="px-3 py-2 text-zinc-300">{p.timeframe ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-200">
                  {p.notionalUsdt !== undefined
                    ? `${p.notionalUsdt.toFixed(2)} USDT`
                    : p.size > 0
                      ? `${p.size.toFixed(4)} qty`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-300">
                  {p.entryPrice > 0 ? p.entryPrice.toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-300">
                  {p.markPrice !== undefined ? p.markPrice.toFixed(4) : "—"}
                </td>
                <td className={`px-3 py-2 font-medium ${ret.className}`}>{ret.text}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500">
                  {p.openedAt ? new Date(p.openedAt).toLocaleString() : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
