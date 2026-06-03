"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { DeskPosition } from "@/lib/bot/futuresDesk";
import type { TradingMode } from "@/lib/bot/config";

export type SessionState = {
  connected: boolean;
  mode: TradingMode;
  balanceUsdt?: number;
  positions?: DeskPosition[];
  positionCount?: number;
  needsConnect?: boolean;
};

type SessionContextValue = {
  session: SessionState;
  loading: boolean;
  refresh: () => Promise<void>;
  setMode: (mode: TradingMode) => Promise<void>;
  connect: (apiKey: string, secret: string, mode?: TradingMode) => Promise<void>;
  disconnect: () => Promise<void>;
};

const defaultSession: SessionState = { connected: false, mode: "demo" };

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(defaultSession);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/session");
    const data = await res.json();
    setSession({
      connected: Boolean(data.connected),
      mode: data.mode === "live" ? "live" : "demo",
      balanceUsdt: data.balanceUsdt,
      positions: data.positions ?? [],
      positionCount: data.positionCount ?? data.positions?.length ?? 0,
      needsConnect: data.needsConnect,
    });
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const setMode = useCallback(
    async (mode: TradingMode) => {
      const res = await fetch("/api/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to switch mode");
      setSession({
        connected: Boolean(data.connected),
        mode: data.mode === "live" ? "live" : "demo",
        balanceUsdt: data.balanceUsdt,
        positions: data.positions ?? [],
        positionCount: data.positionCount ?? data.positions?.length ?? 0,
        needsConnect: data.needsConnect,
      });
    },
    [],
  );

  const connect = useCallback(
    async (apiKey: string, secret: string, mode?: TradingMode) => {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secret, mode: mode ?? session.mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setSession({
        connected: true,
        mode: data.mode === "live" ? "live" : "demo",
        balanceUsdt: data.balanceUsdt,
        positions: data.positions ?? [],
        positionCount: data.positionCount ?? data.positions?.length ?? 0,
      });
    },
    [session.mode],
  );

  const disconnect = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" });
    setSession((s) => ({ connected: false, mode: s.mode }));
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, refresh, setMode, connect, disconnect }}>
      {children}
    </SessionContext.Provider>
  );
}
