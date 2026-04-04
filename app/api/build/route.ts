import { NextResponse } from "next/server";
import { callGLM, extractJSON } from "@/lib/glm";
import {
  getIdeas,
  getAllVotes,
  getBuiltApp,
  setBuiltApp,
  type Idea,
} from "@/lib/kv";
import { buildVoteAnalysisPrompt, buildCodegenPrompt } from "@/lib/prompts";

export async function POST() {
  try {
    const ideas = await getIdeas();
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "No ideas available. Generate ideas first." },
        { status: 400 }
      );
    }

    const votesMap = await getAllVotes(ideas);

    const ideasWithVotes = ideas.map((idea: Idea) => ({
      ...idea,
      ...(votesMap[idea.id] ?? { up: 0, down: 0 }),
    }));

    const analysisMessages = buildVoteAnalysisPrompt(ideasWithVotes);
    const analysisRaw = await callGLM(analysisMessages, 0.3);

    interface AnalysisResult {
      winnerId: string;
      reasoning: string;
    }
    const analysis = extractJSON<AnalysisResult>(analysisRaw);

    const winner = ideas.find((i: Idea) => i.id === analysis.winnerId);
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

    await setBuiltApp(html, winner.id);

    return NextResponse.json({
      winner,
      reasoning: analysis.reasoning,
      html,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const built = await getBuiltApp();
    if (!built.html) {
      return NextResponse.json({ html: null, winnerId: null });
    }
    return NextResponse.json(built);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
