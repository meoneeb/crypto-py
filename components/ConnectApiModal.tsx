"use client";

import { useEffect, useState } from "react";

import type { TradingMode } from "@/lib/bot/config";

export function ConnectApiModal({
  open,
  onClose,
  onConnect,
}: {
  open: boolean;
  onClose: () => void;
  onConnect: (apiKey: string, secret: string, mode: TradingMode) => Promise<void>;
}) {
  const [mode, setMode] = useState<TradingMode>("demo");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("demo");
      setApiKey("");
      setSecret("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConnect(apiKey.trim(), secret.trim(), mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-medium">Connect Binance API</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Keys are stored in an encrypted session cookie until you disconnect.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <span className="text-sm text-zinc-400">Account type</span>
            <div className="mt-2 flex gap-1 rounded-lg border border-zinc-700 p-0.5">
              {(["demo", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm capitalize transition ${
                    mode === m
                      ? m === "live"
                        ? "bg-red-900/60 text-red-100"
                        : "bg-sky-900/60 text-sky-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {mode === "demo"
                ? "Use Binance demo / testnet futures API keys."
                : "Use live Binance futures API keys — real funds."}
            </p>
          </div>

          <label className="block text-sm">
            <span className="text-zinc-400">API Key</span>
            <input
              type="text"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">API Secret</span>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
            />
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
