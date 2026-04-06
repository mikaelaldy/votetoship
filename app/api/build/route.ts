import { callGLM, callGLMStream, extractJSON } from "@/lib/glm";
import {
  acquireLock,
  getActiveRound,
  getAllVotes,
  getAppBySlug,
  getIdeas,
  saveAppToHistory,
  slugify,
  updateActiveRound,
} from "@/lib/kv";
import { ensureRoundInitialized } from "@/lib/rounds";
import { publishGlobalEvent, publishRoundEvent } from "@/lib/realtime";
import { buildVoteAnalysisPrompt, buildCodegenPrompt } from "@/lib/prompts";

export const maxDuration = 300;

export async function POST() {
  const encoder = new TextEncoder();

  const send = (data: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const round = (await getActiveRound()) ?? (await ensureRoundInitialized());

    if (round.status === "OPEN_VOTING") {
      return new Response(
        JSON.stringify({ error: "Round is still in voting phase." }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    if (round.status === "SHOWCASE" && round.winnerSlug) {
      const existing = await getAppBySlug(round.winnerSlug);
      return new Response(
        send({
          type: "done",
          html: existing?.html || "",
          slug: round.winnerSlug,
          reused: true,
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }
      );
    }

    if (round.status !== "BUILDING") {
      return new Response(
        JSON.stringify({ error: `Round status ${round.status} cannot build.` }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const gotLock = await acquireLock(`build:${round.id}`, 360);
    if (!gotLock) {
      return new Response(
        JSON.stringify({ error: "Build already in progress." }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const ideas = await getIdeas();
    if (ideas.length === 0) {
      await updateActiveRound({ status: "ERROR", buildError: "No ideas available." });
      return new Response(
        JSON.stringify({ error: "No ideas available." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const votesMap = await getAllVotes(ideas, round.id);
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
          await publishRoundEvent(round.id, "build.progress", {
            phase: "analysis",
            message: "Analyzing votes...",
            serverTime: Date.now(),
          });

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
                message: `Winner ID \"${analysis.winnerId}\" not found`,
              })
            );
            await updateActiveRound({
              status: "ERROR",
              buildError: `Winner ID ${analysis.winnerId} not found`,
            });
            controller.close();
            return;
          }

          const slug = slugify(winner.title);

          await updateActiveRound({ winnerIdeaId: winner.id });

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

          await publishRoundEvent(round.id, "round.updated", {
            round: {
              ...(await getActiveRound()),
              winnerIdeaId: winner.id,
            },
            serverTime: Date.now(),
          });

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
          let sentChars = 0;

          for await (const chunk of callGLMStream(codegenMessages, 0.4)) {
            fullHtml += chunk;
            sentChars += chunk.length;
            controller.enqueue(send({ type: "code", content: chunk }));

            await publishRoundEvent(round.id, "build.progress", {
              phase: "codegen",
              chars: sentChars,
              serverTime: Date.now(),
            });
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
            roundId: round.id,
          });

          const finishedRound = await updateActiveRound({
            status: "SHOWCASE",
            winnerSlug: slug,
            buildCompletedAt: Date.now(),
            buildError: undefined,
          });

          await publishRoundEvent(round.id, "round.updated", {
            round: finishedRound,
            serverTime: Date.now(),
          });
          await publishGlobalEvent("round.completed", {
            round: finishedRound,
            slug,
            title: winner.title,
            serverTime: Date.now(),
          });

          controller.enqueue(send({ type: "done", html: fullHtml, slug }));
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          await updateActiveRound({
            status: "ERROR",
            buildError: message,
          });
          await publishRoundEvent(round.id, "round.updated", {
            round: await getActiveRound(),
            serverTime: Date.now(),
          });
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
