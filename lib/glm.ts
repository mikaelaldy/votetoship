const GLM_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";

interface GLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GLMResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
  }>;
}

interface GLMStreamOptions {
  includeReasoning?: boolean;
  timeoutMs?: number;
  maxOutputChars?: number;
}

/** Separates `delta.reasoning_content` from `delta.content` (Z.AI streaming). */
export type GLMTaggedChunk = { kind: "reasoning" | "content"; text: string };

export async function callGLM(
  messages: GLMMessage[],
  temperature = 0.7
): Promise<string> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("GLM_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  let response: Response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "GLM-5.1",
        messages,
        temperature,
        max_tokens: 16384,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("GLM request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GLM API error ${response.status}: ${text}`);
  }

  const data: GLMResponse = await response.json();
  const msg = data.choices[0]?.message;
  return msg?.content || msg?.reasoning_content || "";
}

export async function* callGLMStream(
  messages: GLMMessage[],
  temperature = 0.7,
  options: GLMStreamOptions = {}
): AsyncGenerator<string> {
  const includeReasoning = options.includeReasoning ?? false;
  const timeoutMs = options.timeoutMs ?? 120000;
  const maxOutputChars = options.maxOutputChars ?? 220000;
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("GLM_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "GLM-5.1",
        messages,
        temperature,
        max_tokens: 16384,
        stream: true,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("GLM stream timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GLM API error ${response.status}: ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (
    contentType.includes("text/event-stream") ||
    contentType.includes("text/plain") ||
    contentType.includes("chunked")
  ) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let outputChars = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const content = includeReasoning
              ? delta?.content || delta?.reasoning_content || ""
              : delta?.content || "";
            if (content) yield content;
            outputChars += content.length;
            if (outputChars > maxOutputChars) break;
          } catch {
            // skip malformed chunks
          }
        }
        if (outputChars > maxOutputChars) {
          throw new Error("GLM stream exceeded output size limit");
        }
      }
    }
  } else {
    const data: GLMResponse = await response.json();
    const msg = data.choices[0]?.message;
    const content = includeReasoning
      ? msg?.content || msg?.reasoning_content || ""
      : msg?.content || "";
    if (content) yield content;
  }
}

/**
 * Streams GLM output with reasoning and final content split (when the API emits both).
 * Only `content` chunks should be concatenated into the JSON payload; reasoning is for UI only.
 */
export async function* callGLMStreamTagged(
  messages: GLMMessage[],
  temperature = 0.7,
  options: GLMStreamOptions = {}
): AsyncGenerator<GLMTaggedChunk> {
  const timeoutMs = options.timeoutMs ?? 120000;
  const maxOutputChars = options.maxOutputChars ?? 240000;
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("GLM_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "GLM-5.1",
        messages,
        temperature,
        max_tokens: 16384,
        stream: true,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("GLM stream timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GLM API error ${response.status}: ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (
    contentType.includes("text/event-stream") ||
    contentType.includes("text/plain") ||
    contentType.includes("chunked")
  ) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let outputChars = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const reasoningText =
              typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "";
            const contentText = typeof delta?.content === "string" ? delta.content : "";
            if (reasoningText) {
              yield { kind: "reasoning", text: reasoningText };
              outputChars += reasoningText.length;
            }
            if (contentText) {
              yield { kind: "content", text: contentText };
              outputChars += contentText.length;
            }
            if (outputChars > maxOutputChars) break;
          } catch {
            // skip malformed chunks
          }
        }
        if (outputChars > maxOutputChars) {
          throw new Error("GLM stream exceeded output size limit");
        }
      }
    }
  } else {
    const data: GLMResponse = await response.json();
    const msg = data.choices[0]?.message;
    const reasoningText = msg?.reasoning_content || "";
    const contentText = msg?.content || "";
    if (reasoningText) yield { kind: "reasoning", text: reasoningText };
    if (contentText) yield { kind: "content", text: contentText };
  }
}

export function extractJSON<T>(raw: string): T {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  return JSON.parse(candidate.trim()) as T;
}
