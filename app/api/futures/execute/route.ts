import { NextResponse } from "next/server";

import { getFuturesContext, sessionErrorResponse } from "@/lib/api/futuresAuth";
import { executeFuturesDesk } from "@/lib/bot/futuresDesk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await getFuturesContext();
    const body = (await request.json()) as {
      symbol?: string;
      timeframe?: string;
      amountUsdt?: number;
    };
    const symbol = (body.symbol ?? "").trim().toUpperCase();
    const timeframe = (body.timeframe ?? "1m").trim();
    const amountUsdt = Number(body.amountUsdt ?? 10);

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required." }, { status: 400 });
    }
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }

    const result = await executeFuturesDesk(ctx, symbol, timeframe, amountUsdt);
    return NextResponse.json(result);
  } catch (error) {
    return sessionErrorResponse(error);
  }
}
