import { NextResponse } from "next/server";
import { callGLM, extractJSON } from "@/lib/glm";
import { setCurrentIdeas, getCurrentIdeas } from "@/lib/db";
import { buildIdeasPrompt } from "@/lib/prompts";

function generateId(): string {
  return `idea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST() {
  try {
    const messages = buildIdeasPrompt();
    const raw = await callGLM(messages, 0.9);

    interface RawIdea {
      title: string;
      description: string;
    }

    const parsed: RawIdea[] = extractJSON<RawIdea[]>(raw);

    const ideas = parsed.map((idea) => ({
      id: generateId(),
      title: idea.title,
      description: idea.description,
    }));

    await setCurrentIdeas(ideas);

    return NextResponse.json({ ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ideas = await getCurrentIdeas();
    return NextResponse.json({ ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
