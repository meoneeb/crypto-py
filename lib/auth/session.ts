import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

import type { DeskPosition } from "@/lib/bot/futuresDesk";
import { createExchangeFromCredentials } from "@/lib/bot/scanner";
import { getEquity } from "@/lib/bot/risk";
import { mapExchangePositions } from "@/lib/bot/futuresAccount";
import type { TradingMode } from "@/lib/bot/config";

export interface ApiCredentials {
  apiKey: string;
  secret: string;
}

export interface SessionData {
  activeMode: TradingMode;
  demo?: ApiCredentials;
  live?: ApiCredentials;
}

const SESSION_COOKIE = "binance_session";

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a random string of at least 32 characters in .env",
    );
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    password: sessionPassword(),
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export function credentialsForMode(
  session: SessionData,
  mode: TradingMode = session.activeMode,
): ApiCredentials | null {
  const creds = mode === "demo" ? session.demo : session.live;
  if (!creds?.apiKey || !creds?.secret) return null;
  return creds;
}

export function isConnected(session: SessionData): boolean {
  return credentialsForMode(session) !== null;
}

export async function requireSessionCredentials(): Promise<{
  session: SessionData;
  credentials: ApiCredentials;
  mode: TradingMode;
}> {
  const session = await getSession();
  if (!session.activeMode) session.activeMode = "demo";

  const credentials = credentialsForMode(session);
  if (!credentials) {
    throw new SessionError("Not connected. Add your Binance API keys.");
  }

  return { session, credentials, mode: session.activeMode };
}

export class SessionError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

export async function fetchSessionAccountState(mode: TradingMode, credentials: ApiCredentials): Promise<{
  balanceUsdt: number;
  positions: DeskPosition[];
}> {
  const exchange = await createExchangeFromCredentials(credentials, mode, "futures");
  const balanceUsdt = await getEquity(exchange, "futures");
  const positions = await mapExchangePositions(exchange);
  return { balanceUsdt, positions };
}

export async function validateAndConnectCredentials(
  mode: TradingMode,
  apiKey: string,
  secret: string,
): Promise<{ balanceUsdt: number; positions: DeskPosition[] }> {
  const credentials = { apiKey: apiKey.trim(), secret: secret.trim() };
  if (!credentials.apiKey || !credentials.secret) {
    throw new Error("API key and secret are required.");
  }

  const { balanceUsdt, positions } = await fetchSessionAccountState(mode, credentials);
  return { balanceUsdt, positions };
}
