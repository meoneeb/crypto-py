"use client";

import { useState } from "react";

import { ConnectApiModal } from "@/components/ConnectApiModal";
import { useSession } from "@/components/SessionProvider";
import type { TradingMode } from "@/lib/bot/config";

export function Nav() {
  const { session, refresh, connect, disconnect } = useSession();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <header className="border-b border-zinc-800 bg-zinc-900/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-lg font-semibold">Futures Desk</p>
            <p className="text-xs text-zinc-400">Binance USDT-M · EMA + RSI signals</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {session.connected ? (
              <>
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase ${
                    session.mode === "live"
                      ? "bg-red-950/60 text-red-300"
                      : "bg-sky-950/60 text-sky-300"
                  }`}
                >
                  {session.mode}
                </span>
                <div className="text-right text-sm">
                  <p className="font-medium text-zinc-100">
                    {session.balanceUsdt !== undefined
                      ? `${session.balanceUsdt.toFixed(2)} USDT`
                      : "—"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {session.positionCount ?? 0} open position
                    {(session.positionCount ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
              >
                Connect API
              </button>
            )}
          </div>
        </div>
      </header>

      <ConnectApiModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnect={async (apiKey, secret, mode: TradingMode) => {
          await connect(apiKey, secret, mode);
        }}
      />
    </>
  );
}
