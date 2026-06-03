import { NextResponse } from "next/server";

import {
  fetchSessionAccountState,
  getSession,
  isConnected,
  SessionError,
  validateAndConnectCredentials,
} from "@/lib/auth/session";
import type { TradingMode } from "@/lib/bot/config";

export const dynamic = "force-dynamic";

function parseMode(value: unknown): TradingMode {
  return value === "live" ? "live" : "demo";
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session.activeMode) session.activeMode = "demo";

    if (!isConnected(session)) {
      return NextResponse.json({
        connected: false,
        mode: session.activeMode,
      });
    }

    const { balanceUsdt, positions } = await fetchSessionAccountState(
      session.activeMode,
      session.activeMode === "demo" ? session.demo! : session.live!,
    );

    return NextResponse.json({
      connected: true,
      mode: session.activeMode,
      balanceUsdt,
      positions,
      positionCount: positions.length,
    });
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message, connected: false }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error), connected: false },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      apiKey?: string;
      secret?: string;
      mode?: TradingMode;
    };

    const session = await getSession();
    const mode = parseMode(body.mode ?? session.activeMode ?? "demo");
    session.activeMode = mode;

    const { balanceUsdt, positions } = await validateAndConnectCredentials(
      mode,
      body.apiKey ?? "",
      body.secret ?? "",
    );

    const credentials = {
      apiKey: (body.apiKey ?? "").trim(),
      secret: (body.secret ?? "").trim(),
    };

    if (mode === "demo") session.demo = credentials;
    else session.live = credentials;

    await session.save();

    return NextResponse.json({
      connected: true,
      mode,
      balanceUsdt,
      positions,
      positionCount: positions.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { mode?: TradingMode };
    const mode = parseMode(body.mode);
    const session = await getSession();
    session.activeMode = mode;
    await session.save();

    const connected = mode === "demo" ? Boolean(session.demo) : Boolean(session.live);

    if (!connected) {
      return NextResponse.json({
        connected: false,
        mode,
        needsConnect: true,
      });
    }

    const credentials = mode === "demo" ? session.demo! : session.live!;
    const { balanceUsdt, positions } = await fetchSessionAccountState(mode, credentials);

    return NextResponse.json({
      connected: true,
      mode,
      balanceUsdt,
      positions,
      positionCount: positions.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const session = await getSession();
  if (session.activeMode === "live") session.live = undefined;
  else session.demo = undefined;
  await session.save();
  return NextResponse.json({ connected: false, mode: session.activeMode });
}
