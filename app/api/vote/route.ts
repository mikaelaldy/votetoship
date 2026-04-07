import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { castVote, getActiveIdeas, getVoteMap } from "@/lib/store";

function hash(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ideaId?: string;
      direction?: "up" | "down";
      voterToken?: string;
    };

    if (!body.ideaId || !body.direction || !["up", "down"].includes(body.direction)) {
      return NextResponse.json(
        { error: "ideaId and direction (up|down) are required" },
        { status: 400 }
      );
    }

    const ideas = await getActiveIdeas();
    const exists = ideas.some((idea) => idea.id === body.ideaId);
    if (!exists) {
      return NextResponse.json(
        { error: "Idea not in the current battle (refresh the page or try again)." },
        { status: 400 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const voterToken = (body.voterToken || "anon").slice(0, 80);
    const voterKey = hash(`${ip}:${voterToken}`);

    await castVote({
      ideaId: body.ideaId,
      direction: body.direction,
      voterKey,
    });

    const votes = await getVoteMap(ideas.map((i) => i.id));
    return NextResponse.json({ votes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ideas = await getActiveIdeas();
    const votes = await getVoteMap(ideas.map((i) => i.id));
    return NextResponse.json({ votes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
