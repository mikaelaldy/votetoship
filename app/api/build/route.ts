import { NextRequest } from "next/server";
import { callGLM, callGLMStream, extractJSON } from "@/lib/glm";
import {
  appendBuildStream,
  completeBuild,
  failBuild,
  getActiveIdeas,
  getBuildByIdeaId,
  insertBuild,
  slugify,
  touchBuild,
} from "@/lib/store";

export const maxDuration = 300;

interface BuildPayload {
  reasoning: string;
  landingHtml: string;
  appHtml: string;
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
          "You provide short product-build rationale. Keep output concise and practical.",
      },
      {
        role: "user",
        content: `Idea:\nTitle: ${params.title}\nDescription: ${params.description}\n\nGive 2 short sentences explaining how to split this into:\n1) a landing page\n2) an MVP app. Keep it brief.`,
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
        "You are an expert web developer. Return only JSON with three fields: reasoning, landingHtml, appHtml. Both HTML fields must be complete standalone HTML docs using Tailwind CDN and vanilla JS, responsive for desktop and mobile, no external APIs.",
    },
    {
      role: "user" as const,
      content: `Build for this idea:\nTitle: ${params.title}\nDescription: ${params.description}\n\nRequirements:\n- landingHtml: marketing landing page for the idea\n- appHtml: interactive MVP app\n- reasoning: max 2 short sentences\n- Return strictly JSON with keys reasoning, landingHtml, appHtml`,
    },
  ];

  for await (const chunk of callGLMStream(codegenPrompt, 0.35)) {
    fullText += chunk;
    params.controller.enqueue(params.send({ type: "code", content: chunk }));

    const now = Date.now();
    if (now - lastPersistedAt > 1200) {
      await appendBuildStream(params.buildId, fullText);
      await touchBuild(params.buildId);
      lastPersistedAt = now;
    }
  }

  await appendBuildStream(params.buildId, fullText);

  let parsed: BuildPayload;
  try {
    parsed = extractJSON<BuildPayload>(fullText);
  } catch {
    const fallbackMatch = fullText.match(/\{[\s\S]*\}$/);
    if (!fallbackMatch) {
      throw new Error("Could not parse generated output into JSON payload");
    }
    parsed = JSON.parse(fallbackMatch[0]) as BuildPayload;
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

        if (existing?.status === "completed") {
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

        if (existing?.status === "building") {
          controller.enqueue(send({ type: "status", message: "Joining live build..." }));
          await followExistingBuild({ ideaId, controller, send });
          controller.close();
          return;
        }

        const created = await insertBuild({
          ideaId,
          title: idea.title,
          slug: ideaId || slugify(idea.title),
        });

        if (!created) {
          controller.enqueue(send({ type: "status", message: "Joining live build..." }));
          await followExistingBuild({ ideaId, controller, send });
          controller.close();
          return;
        }

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
