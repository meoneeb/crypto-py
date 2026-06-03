import { NextResponse } from "next/server";

import { fetchSessionAccountState } from "@/lib/auth/session";
import { getFuturesContext, sessionErrorResponse } from "@/lib/api/futuresAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const ctx = await getFuturesContext();
    const { balanceUsdt, positions } = await fetchSessionAccountState(ctx.mode, ctx.credentials);
    return NextResponse.json({ balanceUsdt, positions });
  } catch (error) {
    return sessionErrorResponse(error);
  }
}
