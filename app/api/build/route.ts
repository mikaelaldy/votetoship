import { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { BUILD_UPVOTE_THRESHOLD } from "@/lib/constants";
import { callGLMStream } from "@/lib/glm";
import {
  completeBuild,
  failBuild,
  getActiveIdeas,
  getBuildByIdeaId,
  getVoteMap,
  insertBuild,
  restartBuild,
  slugify,
  updateBuildOutputs,
} from "@/lib/store";

export const maxDuration = 300;

const STALE_BUILD_MS = 90_000;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function buildReasoning(title: string, description: string) {
  return `${title} becomes a focused landing page and a lightweight MVP for: ${description}`;
}

async function streamHtmlDocument(params: {
  kind: "landing" | "app";
  title: string;
  description: string;
  buildId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
  abortSignal?: AbortSignal;
}) {
  const currentText = { value: "" };

  params.controller.enqueue(params.send({ type: "phase", phase: params.kind }));
  params.controller.enqueue(
    params.send({
      type: "status",
      message:
        params.kind === "landing"
          ? "Generating landing page HTML first..."
          : "Landing page done. Generating MVP app HTML...",
    })
  );

  const prompt =
    params.kind === "landing"
      ? `Build a responsive marketing landing page for this idea.
Title: ${params.title}
Description: ${params.description}

Requirements:
- Return only a complete standalone HTML document starting with <!DOCTYPE html>
- Use Tailwind via CDN and vanilla JavaScript only
- Keep it polished, conversion-focused, and mobile friendly
- Include hero, value props, feature section, workflow section, CTA, and footer
- No markdown fences, no commentary, no JSON`
      : `Build a responsive MVP web app for this idea.
Title: ${params.title}
Description: ${params.description}

Requirements:
- Return only a complete standalone HTML document starting with <!DOCTYPE html>
- Use Tailwind via CDN and vanilla JavaScript only
- Build a realistic single-page product interface with working demo interactions
- Include clear forms, lists, states, and empty/loading/error treatments where appropriate
- No markdown fences, no commentary, no JSON`;

  for await (const chunk of callGLMStream(
    [
      {
        role: "system",
        content:
          "You are an expert web developer. Return only valid standalone HTML. Do not include analysis, thinking, markdown fences, or any text before or after the HTML document.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    0.15,
    {
      timeoutMs: 120000,
      maxOutputChars: 180000,
      signal: params.abortSignal,
    }
  )) {
    currentText.value += chunk;
    params.controller.enqueue(
      params.send({
        type: params.kind === "landing" ? "landing_chunk" : "app_chunk",
        content: chunk,
      })
    );

    await updateBuildOutputs({
      buildId: params.buildId,
      landingHtml: params.kind === "landing" ? currentText.value : undefined,
      appHtml: params.kind === "app" ? currentText.value : undefined,
      streamText: currentText.value,
      reasoning: buildReasoning(params.title, params.description),
    });
  }

  if (!currentText.value.trim().startsWith("<!DOCTYPE html")) {
    throw new Error(`${params.kind} build did not return a standalone HTML document`);
  }

  params.controller.enqueue(
    params.send({
      type: params.kind === "landing" ? "landing_done" : "app_done",
    })
  );

  return currentText.value;
}

async function buildForIdea(params: {
  ideaId: string;
  title: string;
  description: string;
  buildId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
  abortSignal?: AbortSignal;
}) {
  const reasoning = buildReasoning(params.title, params.description);

  const landingHtml = await streamHtmlDocument({
    kind: "landing",
    title: params.title,
    description: params.description,
    buildId: params.buildId,
    controller: params.controller,
    send: params.send,
    abortSignal: params.abortSignal,
  });

  const appHtml = await streamHtmlDocument({
    kind: "app",
    title: params.title,
    description: params.description,
    buildId: params.buildId,
    controller: params.controller,
    send: params.send,
    abortSignal: params.abortSignal,
  });

  await completeBuild({
    buildId: params.buildId,
    reasoning,
    landingHtml,
    appHtml,
    streamText: `${landingHtml}\n\n${appHtml}`,
  });

  params.controller.enqueue(
    params.send({
      type: "done",
      slug: params.ideaId,
      title: params.title,
      reasoning,
      landingHtml,
      appHtml,
    })
  );
}

async function followExistingBuild(params: {
  ideaId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
  abortSignal?: AbortSignal;
}) {
  let sentLanding = 0;
  let sentApp = 0;
  let lastPhase: "landing" | "app" | "done" | null = null;
  let attempts = 0;

  while (attempts < 240) {
    if (params.abortSignal?.aborted) {
      params.controller.enqueue(
        params.send({ type: "error", message: "Build stopped (you left the stream)" })
      );
      return;
    }

    const current = await getBuildByIdeaId(params.ideaId);
    if (!current) {
      params.controller.enqueue(
        params.send({ type: "error", message: "Build disappeared. Retry build." })
      );
      return;
    }

    const phase: "landing" | "app" | "done" =
      current.status === "completed"
        ? "done"
        : current.app_html
          ? "app"
          : "landing";

    if (phase !== lastPhase) {
      params.controller.enqueue(params.send({ type: "phase", phase }));
      params.controller.enqueue(
        params.send({
          type: "status",
          message:
            phase === "landing"
              ? "Generating landing page HTML first..."
              : phase === "app"
                ? "Landing page done. Generating MVP app HTML..."
                : "Build complete",
        })
      );
      lastPhase = phase;
    }

    if (current.landing_html.length > sentLanding) {
      const delta = current.landing_html.slice(sentLanding);
      sentLanding = current.landing_html.length;
      params.controller.enqueue(params.send({ type: "landing_chunk", content: delta }));
    }

    if (current.app_html.length > sentApp) {
      const delta = current.app_html.slice(sentApp);
      sentApp = current.app_html.length;
      params.controller.enqueue(params.send({ type: "app_chunk", content: delta }));
    }

    if (current.status === "completed") {
      params.controller.enqueue(
        params.send({
          type: "done",
          slug: current.slug,
          title: current.title,
          reasoning: current.reasoning,
          landingHtml: current.landing_html,
          appHtml: current.app_html,
        })
      );
      return;
    }

    if (current.status === "failed") {
      params.controller.enqueue(
        params.send({
          type: "error",
          message: current.error_message || "Build failed",
        })
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts += 1;
  }

  params.controller.enqueue(
    params.send({ type: "error", message: "Build timed out. Please retry." })
  );
}

export async function GET(request: NextRequest) {
  const ideaId = request.nextUrl.searchParams.get("ideaId");
  const forceRebuild = request.nextUrl.searchParams.get("forceRebuild") === "1";
  const abortSignal = request.signal;
  const isAdmin = isAdminRequest(request);
  const encoder = new TextEncoder();

  const send = (data: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  if (!ideaId) {
    return new Response(JSON.stringify({ error: "ideaId query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const ideas = await getActiveIdeas();
        const idea = ideas.find((i) => i.id === ideaId);
        if (!idea) {
          controller.enqueue(send({ type: "error", message: "Idea not found" }));
          controller.close();
          return;
        }

        if (!isAdmin) {
          const voteMap = await getVoteMap([ideaId]);
          const upvotes = voteMap[ideaId]?.up || 0;
          if (upvotes < BUILD_UPVOTE_THRESHOLD) {
            controller.enqueue(
              send({
                type: "error",
                message: `This idea needs ${BUILD_UPVOTE_THRESHOLD} Love votes before it can be built.`,
              })
            );
            controller.close();
            return;
          }
        }

        const existing = await getBuildByIdeaId(ideaId);
        const isStaleBuilding =
          existing?.status === "building" &&
          Date.now() - Date.parse(existing.updated_at) > STALE_BUILD_MS;

        if (existing?.status === "completed" && !forceRebuild) {
          controller.enqueue(
            send({
              type: "done",
              slug: existing.slug,
              title: existing.title,
              reasoning: existing.reasoning,
              landingHtml: existing.landing_html,
              appHtml: existing.app_html,
              cached: true,
            })
          );
          controller.close();
          return;
        }

        if (existing?.status === "building" && !isStaleBuilding && !forceRebuild) {
          controller.enqueue(send({ type: "status", message: "Joining live build..." }));
          await followExistingBuild({ ideaId, controller, send, abortSignal });
          controller.close();
          return;
        }

        if (existing) {
          if (existing.status === "building") {
            await failBuild(
              existing.id,
              isStaleBuilding
                ? "Build marked stale and restarted"
                : "Build restarted by user",
              `${existing.landing_html || ""}\n\n${existing.app_html || ""}`
            );
          }
          if (
            existing.status === "failed" ||
            existing.status === "completed" ||
            forceRebuild ||
            isStaleBuilding
          ) {
            await restartBuild({
              buildId: existing.id,
              title: idea.title,
              slug: ideaId || slugify(idea.title),
            });
            controller.enqueue(send({ type: "status", message: "Build restarted" }));
            await buildForIdea({
              ideaId,
              title: idea.title,
              description: idea.description,
              buildId: existing.id,
              controller,
              send,
              abortSignal,
            });
            controller.close();
            return;
          }
        }

        const created = await insertBuild({
          ideaId,
          title: idea.title,
          slug: ideaId || slugify(idea.title),
        });
        if (!created) throw new Error("Could not initialize build record");

        controller.enqueue(send({ type: "status", message: "Build started" }));

        await buildForIdea({
          ideaId,
          title: idea.title,
          description: idea.description,
          buildId: created.id,
          controller,
          send,
          abortSignal,
        });

        controller.close();
      } catch (error) {
        const aborted = isAbortError(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        const existing = await getBuildByIdeaId(ideaId);
        if (existing && existing.status === "building") {
          await failBuild(
            existing.id,
            aborted ? "Stopped by user" : message,
            `${existing.landing_html || ""}\n\n${existing.app_html || ""}`
          );
        }
        controller.enqueue(
          send({ type: "error", message: aborted ? "Build stopped" : message })
        );
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
