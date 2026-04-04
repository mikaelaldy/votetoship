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

export function buildVoteAnalysisPrompt(
  ideas: Array<{ id: string; title: string; description: string; up: number; down: number }>
): Array<{ role: "system" | "user"; content: string }> {
  const ideasText = ideas
    .map(
      (i) =>
        `ID: ${i.id}\nTitle: ${i.title}\nDescription: ${i.description}\nVotes: ${i.up} up, ${i.down} down (score: ${i.up - i.down})`
    )
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are an expert at evaluating web app ideas for feasibility and fun factor. Your job is to pick the best idea to build based on community votes and your own quality judgment.",
    },
    {
      role: "user",
      content: `Here are the current web app ideas with their community votes:

${ideasText}

Pick the SINGLE best idea to build. Consider:
1. Community enthusiasm (positive vote score)
2. Feasibility — can it be built as a single HTML file with Tailwind + vanilla JS?
3. Fun factor — will users enjoy interacting with it?
4. Visual appeal — will it look good and be impressive?

Return a JSON object with:
- "winnerId": the ID of the chosen idea
- "reasoning": a 1-2 sentence explanation of why this idea won

Return ONLY the JSON object, no other text.`,
    },
  ];
}

export function buildCodegenPrompt(
  title: string,
  description: string
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: `You are an expert web developer. You build complete, polished, interactive single-file web apps using HTML, CSS, and JavaScript. Your apps are visually stunning, fully functional, and ready to use.

RULES:
- Output ONLY the raw HTML code. No markdown fences, no explanations.
- The file must be a complete, valid HTML document.
- Include Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- All JavaScript must be in a <script> tag within the HTML file.
- All custom CSS must be in a <style> tag within the HTML file.
- The app must be FULLY INTERACTIVE and WORKING. Every button, input, and feature must function.
- Use modern, clean design with a dark theme (dark backgrounds, light text, vibrant accents).
- Make it visually impressive — use gradients, shadows, smooth transitions, animations.
- The app should be self-contained and work offline after initial load.
- Do NOT use any external APIs or services.
- Make sure the layout is responsive and looks good on both desktop and mobile.`,
    },
    {
      role: "user",
      content: `Build a complete, interactive web app for this idea:

Title: ${title}
Description: ${description}

Build it as a single HTML file. Make it polished, fun to use, and visually impressive. The app must be fully functional — every feature should work. Use a dark theme with vibrant accent colors.

Output ONLY the HTML code. No explanations, no markdown code fences.`,
    },
  ];
}
