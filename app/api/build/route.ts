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

export const maxDuration = 600;

const STALE_BUILD_MS = 90_000;
const ACTIVE_BUILD_HEARTBEAT_MS = 45_000;
const PHASE_TIMEOUT_MS = 300_000;
const activeBuilds = new Map<string, { lastSeenAt: number }>();

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function buildReasoning(title: string, description: string) {
  return `${title} becomes a focused landing page and a lightweight MVP for: ${description}`;
}

function hasCompleteHtmlDocument(html: string) {
  const trimmed = html.trim();
  return (
    trimmed.startsWith("<!DOCTYPE html>") &&
    /<\/html>\s*$/i.test(trimmed) &&
    /<\/body>\s*<\/html>\s*$/i.test(trimmed)
  );
}

function sanitizeResumedHtml(existingHtml: string, incomingChunk: string) {
  if (!existingHtml || !incomingChunk) return incomingChunk;

  const trimmedChunk = incomingChunk.trimStart();
  if (
    trimmedChunk.startsWith("<!DOCTYPE html>") ||
    trimmedChunk.startsWith("<html") ||
    trimmedChunk.startsWith("<head") ||
    trimmedChunk.startsWith("<body")
  ) {
    return "";
  }

  const maxOverlap = Math.min(existingHtml.length, incomingChunk.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existingHtml.endsWith(incomingChunk.slice(0, size))) {
      return incomingChunk.slice(size);
    }
  }

  return incomingChunk;
}

async function streamHtmlDocument(params: {
  kind: "landing" | "app";
  ideaId: string;
  title: string;
  description: string;
  buildId: string;
  initialHtml?: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
  abortSignal?: AbortSignal;
}) {
  const basePrompt =
    params.kind === "landing"
      ? `Build a responsive marketing landing page for this idea.
Title: ${params.title}
Description: ${params.description}

Requirements:
- Return only a complete standalone HTML document starting with <!DOCTYPE html>
- Use Tailwind via CDN and vanilla JavaScript only
- Keep it polished, conversion-focused, and mobile friendly
- Include hero, value props, feature section, workflow section, CTA, and footer
- Keep custom CSS short and avoid unnecessary libraries
- End the response with </body></html>
- No markdown fences, no commentary, no JSON`
      : `Build a responsive MVP web app for this idea.
Title: ${params.title}
Description: ${params.description}

Requirements:
- Return only a complete standalone HTML document starting with <!DOCTYPE html>
- Use Tailwind via CDN and vanilla JavaScript only
- Build a realistic single-page product interface with working demo interactions
- Include clear forms, lists, states, and empty/loading/error treatments where appropriate
 - Keep custom CSS short and avoid unnecessary libraries
 - End the response with </body></html>
 - No markdown fences, no commentary, no JSON`;

  const initialHtml = params.initialHtml || "";
  const SAVE_INTERVAL_MS = 3000;
  const currentText = { value: initialHtml };
  const attemptPrompt = currentText.value
    ? `${basePrompt}

Continue this partially generated HTML document from exactly where it stops.

Saved partial HTML:
${currentText.value}

Rules for continuation:
- Continue from the saved partial output only
- Do not restart the document
- Do not repeat <!DOCTYPE html>, <html>, <head>, or already-generated markup
 - Finish the same document and close all remaining tags exactly once`
    : basePrompt;
  let lastSaveTime = 0;
  let savePending = false;

  params.controller.enqueue(params.send({ type: "phase", phase: params.kind }));
  params.controller.enqueue(
    params.send({
      type: "status",
      message: currentText.value
        ? params.kind === "landing"
          ? "Resuming saved landing page HTML..."
          : "Resuming saved MVP app HTML..."
        : params.kind === "landing"
          ? "Generating landing page HTML first..."
          : "Landing page done. Generating MVP app HTML...",
    })
  );

  try {
    for await (const chunk of callGLMStream(
      [
        {
          role: "system",
          content:
            "You are an expert web developer. Return only valid standalone HTML. Do not include analysis, thinking, markdown fences, or any text before or after the HTML document.",
        },
        {
          role: "user",
          content: attemptPrompt,
        },
      ],
      0.1,
      {
        timeoutMs: PHASE_TIMEOUT_MS,
        maxOutputChars: 140000,
        signal: params.abortSignal,
      }
    )) {
      activeBuilds.set(params.ideaId, { lastSeenAt: Date.now() });
      const sanitizedChunk = sanitizeResumedHtml(currentText.value, chunk);
      if (!sanitizedChunk) continue;
      currentText.value += sanitizedChunk;
      params.controller.enqueue(
        params.send({
          type: params.kind === "landing" ? "landing_chunk" : "app_chunk",
          content: sanitizedChunk,
        })
      );

      const now = Date.now();
      if (now - lastSaveTime > SAVE_INTERVAL_MS) {
        lastSaveTime = now;
        savePending = false;
        await updateBuildOutputs({
          buildId: params.buildId,
          landingHtml: params.kind === "landing" ? currentText.value : undefined,
          appHtml: params.kind === "app" ? currentText.value : undefined,
          streamText: currentText.value,
          reasoning: buildReasoning(params.title, params.description),
        });
      } else {
        savePending = true;
      }
    }

    if (savePending) {
      await updateBuildOutputs({
        buildId: params.buildId,
        landingHtml: params.kind === "landing" ? currentText.value : undefined,
        appHtml: params.kind === "app" ? currentText.value : undefined,
        streamText: currentText.value,
        reasoning: buildReasoning(params.title, params.description),
      });
    }

    if (!hasCompleteHtmlDocument(currentText.value)) {
      throw new Error(`${params.kind} build returned incomplete HTML`);
    }

    params.controller.enqueue(
      params.send({
        type: params.kind === "landing" ? "landing_done" : "app_done",
      })
    );

    return currentText.value;
  } catch (error) {
    throw error instanceof Error ? error : new Error("HTML generation failed");
  }
}

async function buildForIdea(params: {
  ideaId: string;
  title: string;
  description: string;
  buildId: string;
  startedAt: string;
  existingLandingHtml?: string;
  existingAppHtml?: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
  abortSignal?: AbortSignal;
}) {
  const reasoning = buildReasoning(params.title, params.description);
  const existingLandingHtml = params.existingLandingHtml || "";
  const existingAppHtml = params.existingAppHtml || "";

  const landingHtml = hasCompleteHtmlDocument(existingLandingHtml)
    ? existingLandingHtml
    : await streamHtmlDocument({
        kind: "landing",
        ideaId: params.ideaId,
        title: params.title,
        description: params.description,
        buildId: params.buildId,
        initialHtml: existingLandingHtml,
        controller: params.controller,
        send: params.send,
        abortSignal: params.abortSignal,
      });

  if (hasCompleteHtmlDocument(existingLandingHtml)) {
    params.controller.enqueue(params.send({ type: "phase", phase: "app" }));
    params.controller.enqueue(
      params.send({
        type: "status",
        message: existingAppHtml
          ? "Resuming saved MVP app HTML..."
          : "Landing page done. Generating MVP app HTML...",
      })
    );
  }

  const appHtml = hasCompleteHtmlDocument(existingAppHtml)
    ? existingAppHtml
    : await streamHtmlDocument({
        kind: "app",
        ideaId: params.ideaId,
        title: params.title,
        description: params.description,
        buildId: params.buildId,
        initialHtml: existingAppHtml,
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
      startedAt: params.startedAt,
      completedAt: new Date().toISOString(),
    })
  );
}

async function followExistingBuild(params: {
  ideaId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
  abortSignal?: AbortSignal;
}) {
  const initial = await getBuildByIdeaId(params.ideaId);
  if (!initial) {
    params.controller.enqueue(
      params.send({ type: "error", message: "Build disappeared. Retry build." })
    );
    return;
  }

  let sentLanding = initial.landing_html.length;
  let sentApp = initial.app_html.length;
  let lastPhase: "landing" | "app" | "done" | null = null;
  let attempts = 0;

  params.controller.enqueue(
    params.send({
      type: "snapshot",
      slug: initial.slug,
      title: initial.title,
      status: initial.status,
      startedAt: initial.started_at,
      completedAt: initial.completed_at,
      buildPhase:
        initial.status === "completed"
          ? "done"
          : hasCompleteHtmlDocument(initial.landing_html)
            ? "app"
            : "landing",
      landingHtml: initial.landing_html,
      appHtml: initial.app_html,
      statusMessage:
        initial.status === "completed"
          ? "Build complete"
          : hasCompleteHtmlDocument(initial.landing_html)
            ? initial.app_html
              ? "Resuming saved MVP app HTML..."
              : "Landing page done. Generating MVP app HTML..."
            : initial.landing_html
              ? "Resuming saved landing page HTML..."
              : "Generating landing page HTML first...",
    })
  );

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
          startedAt: current.started_at,
          completedAt: current.completed_at,
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
        const activeBuild = activeBuilds.get(ideaId);
        const isStaleBuilding =
          existing?.status === "building" &&
          Date.now() - Date.parse(existing.updated_at) > STALE_BUILD_MS;
        const hasFreshHeartbeat =
          !!activeBuild && Date.now() - activeBuild.lastSeenAt < ACTIVE_BUILD_HEARTBEAT_MS;

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
              startedAt: existing.started_at,
              completedAt: existing.completed_at,
            })
          );
          controller.close();
          return;
        }

        if (existing?.status === "building" && hasFreshHeartbeat && !forceRebuild) {
          controller.enqueue(send({ type: "status", message: "Joining live build..." }));
          await followExistingBuild({ ideaId, controller, send, abortSignal });
          controller.close();
          return;
        }

        if (existing) {
          if (existing.status === "building" && (forceRebuild || isStaleBuilding)) {
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
            const restartedAt = new Date().toISOString();
            await restartBuild({
              buildId: existing.id,
              title: idea.title,
              slug: ideaId || slugify(idea.title),
            });
            controller.enqueue(send({ type: "status", message: "Build restarted" }));
            controller.enqueue(
              send({
                type: "snapshot",
                slug: ideaId || slugify(idea.title),
                title: idea.title,
                status: "building",
                startedAt: restartedAt,
                completedAt: null,
                buildPhase: "boot",
                landingHtml: "",
                appHtml: "",
                statusMessage: "Build restarted",
              })
            );
            await buildForIdea({
              ideaId,
              title: idea.title,
              description: idea.description,
              buildId: existing.id,
              startedAt: restartedAt,
              controller,
              send,
              abortSignal,
            });
            controller.close();
            return;
          }

          if (existing.status === "building") {
            activeBuilds.set(ideaId, { lastSeenAt: Date.now() });
            controller.enqueue(
              send({
                type: "snapshot",
                slug: existing.slug,
                title: existing.title,
                status: existing.status,
                startedAt: existing.started_at,
                completedAt: existing.completed_at,
                buildPhase: hasCompleteHtmlDocument(existing.landing_html) ? "app" : "landing",
                landingHtml: existing.landing_html,
                appHtml: existing.app_html,
                statusMessage: hasCompleteHtmlDocument(existing.landing_html)
                  ? existing.app_html
                    ? "Resuming saved MVP app HTML..."
                    : "Landing page done. Generating MVP app HTML..."
                  : existing.landing_html
                    ? "Resuming saved landing page HTML..."
                    : "Generating landing page HTML first...",
              })
            );
            await buildForIdea({
              ideaId,
              title: idea.title,
              description: idea.description,
              buildId: existing.id,
              startedAt: existing.started_at,
              existingLandingHtml: existing.landing_html,
              existingAppHtml: existing.app_html,
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

        activeBuilds.set(ideaId, { lastSeenAt: Date.now() });
        controller.enqueue(send({ type: "status", message: "Build started" }));
        controller.enqueue(
          send({
            type: "snapshot",
            slug: created.slug,
            title: created.title,
            status: "building",
            startedAt: created.started_at,
            completedAt: null,
            buildPhase: "boot",
            landingHtml: "",
            appHtml: "",
            statusMessage: "Build started",
          })
        );

        await buildForIdea({
          ideaId,
          title: idea.title,
          description: idea.description,
          buildId: created.id,
          startedAt: created.started_at,
          controller,
          send,
          abortSignal,
        });

        controller.close();
      } catch (error) {
        const aborted = isAbortError(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        const existing = await getBuildByIdeaId(ideaId);
        if (existing && existing.status === "building" && !aborted) {
          await failBuild(
            existing.id,
            aborted ? "Stopped by user" : message,
            `${existing.landing_html || ""}\n\n${existing.app_html || ""}`
          );
        }
        if (!aborted) {
          controller.enqueue(send({ type: "error", message }));
        }
        activeBuilds.delete(ideaId);
        controller.close();
        return;
      }
      activeBuilds.delete(ideaId);
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
