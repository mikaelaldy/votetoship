import { NextRequest, NextResponse } from "next/server";
import { callVote, getActiveRound, getIdeas } from "@/lib/kv";
import { getCurrentRoundState } from "@/lib/rounds";
import { publishRoundEvent } from "@/lib/realtime";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ideaId, direction } = body as {
      ideaId: string;
      direction: "up" | "down";
    };

    if (!ideaId || !direction || !["up", "down"].includes(direction)) {
      return NextResponse.json(
        { error: "ideaId and direction (up|down) are required" },
        { status: 400 }
      );
    }

    const round = await getActiveRound();
    if (!round || round.status !== "OPEN_VOTING") {
      const state = await getCurrentRoundState();
      return NextResponse.json(
        {
          error: "Voting is currently closed",
          votes: state.votes,
          round: state.round,
        },
        { status: 409 }
      );
    }

    const ideaExists = (await getIdeas()).some((i) => i.id === ideaId);
    if (!ideaExists) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const votes = await callVote(ideaId, direction, ip);
    const vote = votes[ideaId] || { up: 0, down: 0 };

    await publishRoundEvent(round.id, "vote.updated", {
      ideaId,
      up: vote.up,
      down: vote.down,
      score: vote.up - vote.down,
      votes,
      roundId: round.id,
      serverTime: Date.now(),
    });

    return NextResponse.json({ votes, round });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const state = await getCurrentRoundState();
    return NextResponse.json({
      votes: state.votes,
      round: state.round,
      serverTime: state.serverTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
