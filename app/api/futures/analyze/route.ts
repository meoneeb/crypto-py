import { NextResponse } from "next/server";

import { credentialsForMode, getSession } from "@/lib/auth/session";
import { sessionErrorResponse } from "@/lib/api/futuresAuth";
import { getFuturesSignal } from "@/lib/bot/futuresDesk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { symbol?: string; timeframe?: string };
    const symbol = (body.symbol ?? "").trim().toUpperCase();
    const timeframe = (body.timeframe ?? "1m").trim();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required." }, { status: 400 });
    }

    const session = await getSession();
    if (!session.activeMode) session.activeMode = "demo";

    const credentials = credentialsForMode(session);
    const ctx = credentials
      ? { credentials, mode: session.activeMode }
      : null;

    const signal = await getFuturesSignal(symbol, timeframe, ctx);
    return NextResponse.json({ signal });
  } catch (error) {
    return sessionErrorResponse(error);
  }
}
