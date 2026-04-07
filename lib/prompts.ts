export function buildIdeasPrompt(): Array<{
  role: "system" | "user";
  content: string;
}> {
  return [
    {
      role: "system",
      content:
        "You are a creative web app idea generator. Generate ideas that are fun, buildable as single-page web apps, and visually interesting. Each idea must be feasible to implement in a single HTML file with Tailwind CSS and vanilla JavaScript.",
    },
    {
      role: "user",
      content: `Generate 5 creative, fun web app ideas. Each idea should be a small interactive web app that can be built as a single HTML file.

Return a JSON array with exactly 5 objects. Each object has:
- "title": a catchy short name (2-5 words)
- "description": one sentence describing what it does and why it's fun

Think interactive toys, mini-games, creative tools, visualizations, or utilities. Make them diverse — don't repeat the same category.

Examples of good categories: puzzle games, drawing tools, sound visualizers, habit trackers, personality quizzes, mini simulations, retro games, data visualizers.

Return ONLY the JSON array, no other text.`,
    },
  ];
}
