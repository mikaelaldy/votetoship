import { NextRequest, NextResponse } from "next/server";
import { tickRoundTransitions } from "@/lib/rounds";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  return headerSecret === secret || bearer === secret;
}

async function handleTick(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await tickRoundTransitions();
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleTick(request);
}

export async function GET(request: NextRequest) {
  return handleTick(request);
}
