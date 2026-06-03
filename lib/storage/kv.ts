import { kv } from "@vercel/kv";

import { mergeSettings } from "@/lib/bot/defaults";
import type {
  BotSettings,
  BotState,
  ScanLogEntry,
  TradeRecord,
  TradingMode,
} from "@/lib/storage/types";

/** Persist in-memory store across Next.js dev hot reloads and server action isolates. */
const globalStore = globalThis as typeof globalThis & {
  __botMemoryStore?: Map<string, unknown>;
};

function getMemoryStore(): Map<string, unknown> {
  if (!globalStore.__botMemoryStore) {
    globalStore.__botMemoryStore = new Map<string, unknown>();
  }
  return globalStore.__botMemoryStore;
}

function hasKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getJson<T>(key: string): Promise<T | null> {
  if (hasKv()) {
    return (await kv.get<T>(key)) ?? null;
  }
  return (getMemoryStore().get(key) as T | undefined) ?? null;
}

async function setJson<T>(key: string, value: T): Promise<void> {
  if (hasKv()) {
    await kv.set(key, value);
    return;
  }
  getMemoryStore().set(key, value);
}

function stateKey(mode: TradingMode): string {
  return `bot:state:${mode}`;
}

function tradesKey(mode: TradingMode): string {
  return `bot:trades:${mode}`;
}

function scanLogKey(mode: TradingMode): string {
  return `bot:scan-log:${mode}`;
}

const SETTINGS_KEY = "bot:settings";

export async function getSettings(): Promise<BotSettings> {
  const overrides = await getJson<Partial<BotSettings>>(SETTINGS_KEY);
  const settings = mergeSettings(overrides);
  return settings;
}

export async function saveSettings(partial: Partial<BotSettings>): Promise<BotSettings> {
  const current = await getSettings();
  const next = mergeSettings({ ...current, ...partial });
  await setJson(SETTINGS_KEY, next);
  return next;
}

export async function getBotState(mode: TradingMode): Promise<BotState> {
  const state = await getJson<BotState>(stateKey(mode));
  return state ?? { lastSignals: {} };
}

export async function saveBotState(mode: TradingMode, state: BotState): Promise<void> {
  await setJson(stateKey(mode), state);
}

export async function appendTrade(mode: TradingMode, trade: TradeRecord): Promise<void> {
  const key = tradesKey(mode);
  const existing = (await getJson<TradeRecord[]>(key)) ?? [];
  const next = [trade, ...existing].slice(0, 200);
  await setJson(key, next);
}

export async function getTrades(mode: TradingMode): Promise<TradeRecord[]> {
  return (await getJson<TradeRecord[]>(tradesKey(mode))) ?? [];
}

export async function appendScanLog(mode: TradingMode, entry: ScanLogEntry): Promise<void> {
  const key = scanLogKey(mode);
  const existing = (await getJson<ScanLogEntry[]>(key)) ?? [];
  const next = [entry, ...existing].slice(0, 50);
  await setJson(key, next);
}

export async function getScanLogs(mode: TradingMode): Promise<ScanLogEntry[]> {
  return (await getJson<ScanLogEntry[]>(scanLogKey(mode))) ?? [];
}

export function isKvConfigured(): boolean {
  return hasKv();
}
