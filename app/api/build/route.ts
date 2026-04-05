import { callGLM, callGLMStream, extractJSON } from "@/lib/glm";
import { buildVoteAnalysisPrompt, buildCodegenPrompt } from "@/lib/prompts";
import { getCurrentIdeas, getVotes, saveBuiltApp, updateBattleStatus } from "@/lib/db";
import { slugify } from "@/lib/storage";

export const maxDuration = 300;

interface IdeaWithVotes {
  id: string;
  title: string;
  description: string;
  up: number;
  down: number;
}

export async function POST() {
  const encoder = new TextEncoder();

  const send = (data: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  let ideasWithVotes: IdeaWithVotes[];
  try {
    const [ideas, votes] = await Promise.all([getCurrentIdeas(), getVotes()]);

    if (!ideas || ideas.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No ideas found. Generate and vote on ideas first.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    ideasWithVotes = ideas.map((idea) => ({
      ...idea,
      ...(votes[idea.id] ?? { up: 0, down: 0 }),
    }));
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to read ideas from database" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          send({ type: "status", message: "Analyzing votes..." })
        );

        const analysisMessages = buildVoteAnalysisPrompt(ideasWithVotes);
        const analysisRaw = await callGLM(analysisMessages, 0.3);

        interface AnalysisResult {
          winnerId: string;
          reasoning: string;
        }
        const analysis = extractJSON<AnalysisResult>(analysisRaw);

        const winner = ideasWithVotes.find((i) => i.id === analysis.winnerId);
        if (!winner) {
          controller.enqueue(
            send({
              type: "error",
              message: `Winner ID "${analysis.winnerId}" not found in ideas`,
            })
          );
          controller.close();
          return;
        }

        controller.enqueue(
          send({
            type: "analysis",
            winner: {
              id: winner.id,
              title: winner.title,
              description: winner.description,
            },
            reasoning: analysis.reasoning,
          })
        );

        controller.enqueue(
          send({
            type: "status",
            message: `Generating ${winner.title}...`,
          })
        );

        await updateBattleStatus("building");

        const codegenMessages = buildCodegenPrompt(
          winner.title,
          winner.description
        );
        let fullHtml = "";

        for await (const chunk of callGLMStream(codegenMessages, 0.4)) {
          fullHtml += chunk;
          controller.enqueue(send({ type: "code", content: chunk }));
        }

        if (fullHtml.includes("```html")) {
          const match = fullHtml.match(/```html\s*([\s\S]*?)```/);
          if (match) fullHtml = match[1].trim();
        } else if (fullHtml.includes("```")) {
          const match = fullHtml.match(/```\s*([\s\S]*?)```/);
          if (match) fullHtml = match[1].trim();
        }

        const appSlug = slugify(winner.title);
        await saveBuiltApp(appSlug, winner.title, analysis.reasoning, fullHtml);
        await updateBattleStatus("finished");

        controller.enqueue(send({ type: "done", html: fullHtml }));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(send({ type: "error", message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
