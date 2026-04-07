export function buildIdeasPrompt(): Array<{
  role: "system" | "user";
  content: string;
}> {
  return [
    {
      role: "system",
      content:
        "You are a startup product strategist generating realistic SaaS ideas that are practical to validate quickly. Every idea must map to a clear business pain, a specific user persona, and an MVP that can be built as a single-page web app in one HTML file with Tailwind CSS and vanilla JavaScript.",
    },
    {
      role: "user",
      content: `Generate 12 realistic SaaS web app ideas. Each idea should still be buildable as a lightweight MVP in a single HTML file.

Return a JSON array with exactly 12 objects. Each object has:
- "title": a catchy short name (2-5 words)
- "description": one sentence that includes:
  1) target user,
  2) painful workflow/problem,
  3) clear MVP value

Constraints:
- Focus on B2B/B2C SaaS use cases people would actually pay for.
- Avoid gimmicks, games, and novelty-only concepts.
- Keep scope realistic for a hackathon MVP.
- Make the list diverse across industries (ops, sales, support, finance, creator, education, etc.).

Return ONLY the JSON array, no other text.`,
    },
  ];
}
