import { NextRequest } from "next/server";
import { callGLM, callGLMStreamTagged, extractJSON } from "@/lib/glm";
import {
  appendBuildStream,
  completeBuild,
  failBuild,
  getActiveIdeas,
  getBuildByIdeaId,
  insertBuild,
  restartBuild,
  slugify,
  touchBuild,
} from "@/lib/store";

export const maxDuration = 300;

interface BuildPayload {
  reasoning: string;
  landingHtml: string;
  appHtml: string;
}

const STALE_BUILD_MS = 90_000;

function isBuildPayload(value: unknown): value is BuildPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.reasoning === "string" &&
    typeof payload.landingHtml === "string" &&
    typeof payload.appHtml === "string"
  );
}

function tryParseBuildPayload(raw: string): BuildPayload | null {
  try {
    const parsed = extractJSON<BuildPayload>(raw);
    if (isBuildPayload(parsed)) return parsed;
  } catch {
    // fall through
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as unknown;
      if (isBuildPayload(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  return null;
}

async function repairBuildPayload(raw: string): Promise<BuildPayload | null> {
  const repaired = await callGLM(
    [
      {
        role: "system",
        content:
          "Return strict minified JSON only. Required keys: reasoning, landingHtml, appHtml. Do not include markdown fences.",
      },
      {
        role: "user",
        content: `Fix this model output into valid JSON with the required keys and keep best available HTML:\n\n${raw}`,
      },
    ],
    0
  );
  return tryParseBuildPayload(repaired);
}

async function buildForIdea(params: {
  ideaId: string;
  title: string;
  description: string;
  buildId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
}) {
  let fullText = "";
  let lastPersistedAt = Date.now();

  params.controller.enqueue(
    params.send({ type: "analysis", message: "Preparing concise build plan..." })
  );

  const reasoningRaw = await callGLM(
    [
      {
        role: "system",
        content:
          "You write a short build plan in Markdown only. Use headings (##), bullet lists, and bold for emphasis. No code fences. Keep it scannable and practical.",
      },
      {
        role: "user",
        content: `Idea:\nTitle: ${params.title}\nDescription: ${params.description}\n\nProduce Markdown with:\n## Plan\n- **Landing page:** ...\n- **MVP app:** ...\nKeep each bullet to 1–2 sentences.`,
      },
    ],
    0.2
  );

  params.controller.enqueue(params.send({ type: "reasoning", content: reasoningRaw }));

  params.controller.enqueue(
    params.send({ type: "status", message: "Generating landing + MVP HTML..." })
  );

  const codegenPrompt = [
    {
      role: "system" as const,
      content:
        "You are an expert web developer. Output STRICT JSON only, no prose and no markdown fences. Required keys: reasoning, landingHtml, appHtml. Both HTML values must be complete standalone <!DOCTYPE html> documents using Tailwind CDN and vanilla JS, responsive desktop/mobile, no external APIs.",
    },
    {
      role: "user" as const,
      content: `Build for this idea:\nTitle: ${params.title}\nDescription: ${params.description}\n\nRequirements:\n- reasoning: max 2 short sentences\n- landingHtml: marketing landing page\n- appHtml: interactive MVP app\n- Return STRICT JSON object with exactly keys reasoning, landingHtml, appHtml\n- Do not output any thinking or commentary`,
    },
  ];

  for await (const chunk of callGLMStreamTagged(codegenPrompt, 0.35, {
    timeoutMs: 120000,
    maxOutputChars: 240000,
  })) {
    if (chunk.kind === "reasoning") {
      params.controller.enqueue(
        params.send({ type: "thinking_delta", content: chunk.text })
      );
    } else {
      fullText += chunk.text;
      params.controller.enqueue(params.send({ type: "code", content: chunk.text }));
    }

    const now = Date.now();
    if (now - lastPersistedAt > 1200) {
      await appendBuildStream(params.buildId, fullText);
      await touchBuild(params.buildId);
      lastPersistedAt = now;
    }
  }

  await appendBuildStream(params.buildId, fullText);

  let parsed = tryParseBuildPayload(fullText);
  if (!parsed) {
    params.controller.enqueue(
      params.send({ type: "status", message: "Repairing malformed model output..." })
    );
    parsed = await repairBuildPayload(fullText);
  }

  if (!parsed) {
    throw new Error("Could not parse generated output into JSON payload");
  }

  if (!parsed.landingHtml.trim() || !parsed.appHtml.trim()) {
    throw new Error("Generated payload is missing required HTML output");
  }

  await completeBuild({
    buildId: params.buildId,
    reasoning: parsed.reasoning || reasoningRaw,
    landingHtml: parsed.landingHtml,
    appHtml: parsed.appHtml,
    streamText: fullText,
  });

  params.controller.enqueue(
    params.send({
      type: "done",
      slug: params.ideaId,
      title: params.title,
      reasoning: parsed.reasoning || reasoningRaw,
      landingHtml: parsed.landingHtml,
      appHtml: parsed.appHtml,
    })
  );
}

async function followExistingBuild(params: {
  ideaId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  send: (data: Record<string, unknown>) => Uint8Array;
}) {
  let sent = 0;
  let attempts = 0;

  while (attempts < 240) {
    const current = await getBuildByIdeaId(params.ideaId);
    if (!current) {
      params.controller.enqueue(
        params.send({ type: "error", message: "Build disappeared. Retry build." })
      );
      return;
    }

    const stream = current.stream_text || "";
    if (stream.length > sent) {
      const delta = stream.slice(sent);
      sent = stream.length;
      params.controller.enqueue(params.send({ type: "code", content: delta }));
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
          await followExistingBuild({ ideaId, controller, send });
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
              existing.stream_text || ""
            );
          }
          if (existing.status === "failed" || existing.status === "completed" || forceRebuild || isStaleBuilding) {
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
        });

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const existing = await getBuildByIdeaId(ideaId);
        if (existing && existing.status === "building") {
          await failBuild(existing.id, message, existing.stream_text || "");
        }
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
