import { FuturesDesk } from "@/components/FuturesDesk";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Futures trading</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Get a BUY or SELL signal (no API keys), then connect and confirm to trade.
        </p>
      </div>
      <FuturesDesk />
    </div>
  );
}
