import { NextResponse } from "next/server";
import { createNewRound, getCurrentRoundState } from "@/lib/rounds";

export async function POST() {
  try {
    const round = await createNewRound();
    const state = await getCurrentRoundState();
    return NextResponse.json({ round, ideas: state.ideas, votes: state.votes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const state = await getCurrentRoundState();
    return NextResponse.json({
      round: state.round,
      ideas: state.ideas,
      votes: state.votes,
      serverTime: state.serverTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
