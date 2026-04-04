import { NextRequest, NextResponse } from "next/server";
import { callGLM, extractJSON } from "@/lib/glm";
import { buildVoteAnalysisPrompt, buildCodegenPrompt } from "@/lib/prompts";

interface IdeaWithVotes {
  id: string;
  title: string;
  description: string;
  up: number;
  down: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ideasWithVotes: IdeaWithVotes[] = body.ideasWithVotes;

    if (!ideasWithVotes || ideasWithVotes.length === 0) {
      return NextResponse.json(
        { error: "No ideas provided. Generate and vote on ideas first." },
        { status: 400 }
      );
    }

    const analysisMessages = buildVoteAnalysisPrompt(ideasWithVotes);
    const analysisRaw = await callGLM(analysisMessages, 0.3);

    interface AnalysisResult {
      winnerId: string;
      reasoning: string;
    }
    const analysis = extractJSON<AnalysisResult>(analysisRaw);

    const winner = ideasWithVotes.find((i) => i.id === analysis.winnerId);
    if (!winner) {
      return NextResponse.json(
        { error: "Winner ID not found in ideas", analysis },
        { status: 500 }
      );
    }

    const codegenMessages = buildCodegenPrompt(
      winner.title,
      winner.description
    );
    let html = await callGLM(codegenMessages, 0.4);

    if (html.includes("```html")) {
      const match = html.match(/```html\s*([\s\S]*?)```/);
      if (match) html = match[1].trim();
    } else if (html.includes("```")) {
      const match = html.match(/```\s*([\s\S]*?)```/);
      if (match) html = match[1].trim();
    }

    return NextResponse.json({
      winner: { id: winner.id, title: winner.title, description: winner.description },
      reasoning: analysis.reasoning,
      html,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
