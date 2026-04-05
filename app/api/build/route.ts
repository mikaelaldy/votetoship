import { callGLM, callGLMStream, extractJSON } from "@/lib/glm";
import {
  getIdeas,
  getAllVotes,
  saveAppToHistory,
  clearBattleState,
  slugify,
} from "@/lib/kv";
import { buildVoteAnalysisPrompt, buildCodegenPrompt } from "@/lib/prompts";

export const maxDuration = 300;

export async function POST() {
  const encoder = new TextEncoder();

  const send = (data: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const ideas = await getIdeas();
    if (ideas.length === 0) {
      return new Response(
        JSON.stringify({ error: "No ideas available." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const votesMap = await getAllVotes(ideas);
    const ideasWithVotes = ideas.map((idea) => ({
      ...idea,
      ...(votesMap[idea.id] ?? { up: 0, down: 0 }),
    }));

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
                message: `Winner ID "${analysis.winnerId}" not found`,
              })
            );
            controller.close();
            return;
          }

          const slug = slugify(winner.title);

          controller.enqueue(
            send({
              type: "analysis",
              winner: {
                id: winner.id,
                title: winner.title,
                description: winner.description,
              },
              reasoning: analysis.reasoning,
              slug,
            })
          );

          controller.enqueue(
            send({
              type: "status",
              message: `Generating ${winner.title}...`,
            })
          );

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

          await saveAppToHistory({
            slug,
            title: winner.title,
            reasoning: analysis.reasoning,
            html: fullHtml,
            builtAt: Date.now(),
          });

          await clearBattleState();

          controller.enqueue(send({ type: "done", html: fullHtml, slug }));
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
