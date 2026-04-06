import { NextResponse } from "next/server";
import { getCurrentRoundState } from "@/lib/rounds";

export async function GET() {
  try {
    const state = await getCurrentRoundState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
