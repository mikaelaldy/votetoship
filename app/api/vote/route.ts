import { NextRequest, NextResponse } from "next/server";
import { castVote, getVotes, getIdeas, getAllVotes } from "@/lib/kv";

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

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    let votes;
    try {
      votes = await castVote(ideaId, direction, ip);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("Rate limited")
      ) {
        votes = await getVotes(ideaId);
        return NextResponse.json({ votes, rateLimited: true });
      }
      throw err;
    }

    return NextResponse.json({ votes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ideas = await getIdeas();
    const votes = await getAllVotes(ideas);
    return NextResponse.json({ votes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
