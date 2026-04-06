import { NextResponse } from "next/server";
import { callGLM, extractJSON } from "@/lib/glm";
import { buildIdeasPrompt } from "@/lib/prompts";
import { getActiveIdeas, setActiveBattle } from "@/lib/store";

interface RawIdea {
  title: string;
  description: string;
}

function fallbackIdeas(): RawIdea[] {
  return [
    {
      title: "SwipeFit Sprint",
      description:
        "A playful micro habit challenge where each swipe commits to a tiny daily action.",
    },
    {
      title: "Mood Palette Mixer",
      description:
        "Blend moods into animated palettes and generate daily visual cards to share.",
    },
    {
      title: "Focus Arena",
      description:
        "Compete against your own focus sessions with a live scoreboard and streak bonuses.",
    },
    {
      title: "Tiny Product Judge",
      description:
        "Compare two micro-product ideas at a time and score them for fun and usefulness.",
    },
    {
      title: "Retro Landing Lab",
      description:
        "Remix old-school web aesthetics into modern landing concepts with interactive controls.",
    },
  ];
}

export async function POST() {
  try {
    let parsed: RawIdea[] = [];

    try {
      const raw = await callGLM(buildIdeasPrompt(), 0.8);
      parsed = extractJSON<RawIdea[]>(raw);
    } catch {
      parsed = fallbackIdeas();
    }

    const ideas = await setActiveBattle(parsed.slice(0, 5));
    return NextResponse.json({ ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    let ideas = await getActiveIdeas();
    if (ideas.length === 0) {
      ideas = await setActiveBattle(fallbackIdeas());
    }
    return NextResponse.json({ ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
