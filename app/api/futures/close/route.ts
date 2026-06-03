import { NextResponse } from "next/server";

import { getFuturesContext, sessionErrorResponse } from "@/lib/api/futuresAuth";
import { closeFuturesDeskPosition } from "@/lib/bot/futuresDesk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await getFuturesContext();
    const body = (await request.json()) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim().toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required." }, { status: 400 });
    }

    const result = await closeFuturesDeskPosition(ctx, symbol);
    return NextResponse.json(result);
  } catch (error) {
    return sessionErrorResponse(error);
  }
}
