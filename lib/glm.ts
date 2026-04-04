const GLM_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";

interface GLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GLMResponse {
  choices: Array<{
    message: {
      content: string;
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
      model: "glm-4-plus",
      messages,
      temperature,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GLM API error ${response.status}: ${text}`);
  }

  const data: GLMResponse = await response.json();
  return data.choices[0]?.message?.content ?? "";
}

export function extractJSON<T>(raw: string): T {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  return JSON.parse(candidate.trim()) as T;
}
