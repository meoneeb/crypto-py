import { NextResponse } from "next/server";

import { requireSessionCredentials, SessionError } from "@/lib/auth/session";
import type { FuturesContext } from "@/lib/bot/futuresDesk";

export async function getFuturesContext(): Promise<FuturesContext> {
  const { credentials, mode } = await requireSessionCredentials();
  return { credentials, mode };
}

export function sessionErrorResponse(error: unknown) {
  if (error instanceof SessionError) {
    return NextResponse.json({ error: error.message, connected: false }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: 500 },
  );
}
