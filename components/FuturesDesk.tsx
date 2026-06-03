"use client";

import { useCallback, useEffect, useState } from "react";

import { OpenPositionsTable } from "@/components/OpenPositionsTable";
import { SymbolCombobox } from "@/components/SymbolCombobox";
import { useSession } from "@/components/SessionProvider";
import type { DeskPosition, FuturesSignal } from "@/lib/bot/futuresDesk";

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];

export function FuturesDesk() {
  const { session, refresh } = useSession();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1m");
  const [amount, setAmount] = useState("10");
  const [signal, setSignal] = useState<FuturesSignal | null>(null);
  const [positions, setPositions] = useState<DeskPosition[]>([]);
  const [busy, setBusy] = useState<"signal" | "confirm" | "close" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = session.connected;

  const loadPositions = useCallback(async () => {
    if (!connected) {
      setPositions([]);
      return;
    }
    try {
      const res = await fetch("/api/futures/account");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load positions");
      setPositions(data.positions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    }
  }, [connected]);

  useEffect(() => {
    if (session.positions) {
      setPositions(session.positions);
    } else {
      void loadPositions();
    }
  }, [session.positions, loadPositions]);

  useEffect(() => {
    if (connected && symbol.trim()) {
      void refreshSignal().catch(() => undefined);
    }
  }, [connected]);

  async function refreshSignal(sym = symbol.trim().toUpperCase()) {
    if (!sym) return;
    const res = await fetch("/api/futures/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym, timeframe }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to get signal");
    setSignal(data.signal);
  }

  async function runGetSignal() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;

    setBusy("signal");
    setError(null);
    setMessage(null);
    setSignal(null);
    try {
      await refreshSignal(sym);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get signal");
    } finally {
      setBusy(null);
    }
  }

  async function runConfirm() {
    if (!signal || !connected) return;
    if (!signal.canExecute) {
      setError("Connect API and ensure no open position on this symbol to trade.");
      return;
    }
    setBusy("confirm");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/futures/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          timeframe,
          amountUsdt: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order failed");
      const warn =
        data.warnings?.length ? ` · ${data.warnings.join("; ")}` : "";
      setMessage(`${data.signal} filled @ ${Number(data.fillPrice).toFixed(4)}${warn}`);
      await refresh();
      await loadPositions();
      await refreshSignal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setBusy(null);
    }
  }

  async function runClose() {
    if (!signal?.canClose || !connected) return;
    setBusy("close");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/futures/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Close failed");
      setMessage(`Closed ${symbol.trim().toUpperCase()}`);
      await refresh();
      await loadPositions();
      await refreshSignal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Close failed");
    } finally {
      setBusy(null);
    }
  }

  const signalClass =
    signal?.signalColor === "green" ? "text-emerald-400" : "text-red-400";

  const canTrade = connected && signal?.canExecute;
  const canClosePosition = connected && signal?.canClose;

  return (
    <div className="space-y-6">
      {!connected ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
          Signals are public — no API keys needed. Connect your Binance API in the nav bar to
          trade.
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <SymbolCombobox
            value={symbol}
            onChange={(s) => {
              setSymbol(s);
              setSignal(null);
            }}
          />

          <label className="text-sm">
            <span className="text-zinc-400">Timeframe</span>
            <select
              className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={timeframe}
              onChange={(e) => {
                setTimeframe(e.target.value);
                setSignal(null);
              }}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="text-zinc-400">Amount (USDT)</span>
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 block w-28 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!canTrade}
            />
          </label>

          <button
            type="button"
            onClick={runGetSignal}
            disabled={busy !== null || !symbol.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy === "signal" ? "…" : "Get Signal"}
          </button>
        </div>

        {signal ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-zinc-800 pt-4">
            <p className={`text-2xl font-bold ${signalClass}`}>{signal.signal}</p>
            <p className="text-sm text-zinc-400">
              {signal.close.toFixed(4)} · RSI {signal.rsi.toFixed(1)} · {signal.timeframe}
            </p>
            {canTrade ? (
              <button
                type="button"
                onClick={runConfirm}
                disabled={busy !== null}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === "confirm" ? "…" : `Confirm ${signal.signal}`}
              </button>
            ) : signal && connected && !signal.canExecute && !signal.canClose ? (
              <span className="text-xs text-zinc-500">Already have a position on this symbol</span>
            ) : signal && !connected ? (
              <span className="text-xs text-zinc-500">Connect API to trade</span>
            ) : null}
            {canClosePosition ? (
              <button
                type="button"
                onClick={runClose}
                disabled={busy !== null}
                className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-200 hover:bg-red-950/50 disabled:opacity-50"
              >
                {busy === "close" ? "…" : "Close"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            Pick symbol and timeframe, then Get Signal for BUY or SELL.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 font-medium">Open positions</h2>
        {!connected ? (
          <p className="text-sm text-zinc-500">Connect API to view positions.</p>
        ) : (
          <OpenPositionsTable
            positions={positions}
            highlightSymbol={symbol.trim().toUpperCase()}
          />
        )}
      </section>

      {error ? (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
