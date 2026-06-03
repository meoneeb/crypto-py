import { NextResponse } from "next/server";

import { listFuturesSymbols } from "@/lib/bot/futuresDesk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const symbols = await listFuturesSymbols(q);
    return NextResponse.json({ symbols });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
