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

export async function callGLM(
  messages: GLMMessage[],
  temperature = 0.7
): Promise<string> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("GLM_API_KEY is not set");

  const response = await fetch(GLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "GLM-5.1",
      messages,
      temperature,
      max_tokens: 16384,
    }),
  });

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
  temperature = 0.7
): AsyncGenerator<string> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("GLM_API_KEY is not set");

  const response = await fetch(GLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "GLM-5.1",
      messages,
      temperature,
      max_tokens: 16384,
      stream: true,
    }),
  });

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const content =
              delta?.content || delta?.reasoning_content || "";
            if (content) yield content;
          } catch {
            // skip malformed chunks
          }
        }
      }
    }
  } else {
    const data: GLMResponse = await response.json();
    const msg = data.choices[0]?.message;
    const content = msg?.content || msg?.reasoning_content || "";
    if (content) yield content;
  }
}

export function extractJSON<T>(raw: string): T {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  return JSON.parse(candidate.trim()) as T;
}
