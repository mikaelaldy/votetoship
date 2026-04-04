Project Name: VoteToShip
Hackathon: Build with GLM 5.1 Challenge (Deadline: April 6, 2026)
Goal: Build a fun, no-login web app that demonstrates the agentic power of GLM 5.1 — community votes on web app ideas → the highest positive-voted idea gets automatically built live as an interactive single-file web app.1. Core Vision & DifferentiationVoteToShip is not another idea generator like ideasai.com.Focus exclusively on web app ideas (not general startups).
Community votes with  (up) and  (down).
The highest positive-scoring idea (that is not heavily downvoted) is automatically selected.
GLM 5.1 acts as a full agent: analyzes votes → reasons about quality → plans the app → generates a complete, interactive, single-file web app (HTML + Tailwind + vanilla JS).
Users can instantly play with the live preview in an iframe, copy the full code, and iterate.

Key differentiator:
“Community votes → GLM 5.1 ships a real playable web app in seconds.”
This showcases long-horizon reasoning, planning, tool orchestration, and strong code generation of GLM 5.1.2. Two Separate Pages (Keep simple)Landing Page (/) — Marketing-focused, mostly static, beautiful hero.Headline: “Vote on web app ideas → The winner gets built live by GLM 5.1”
Short demo GIF/video
How it works (3–4 steps)
Sponsor card (to help upgrade the GLM Pro plan)

MVP Arena (/arena) — The core experience (does only one thing well).Grid of 6–10 fresh web app ideas with title + 1-sentence description.
One-click  upvote and  downvote (no login).
Real-time vote counters.
“Build Current Winner” button (or auto every ~10 min during off-peak).
Below: Live preview of the generated app in a nice framed iframe.
Buttons: Play with it / Copy full code / Improve this app.

3. Technical Constraints (Strict)Stack (ultra light & fast):Next.js 15 (App Router) — minimal, no heavy Server Components.
Tailwind CSS + shadcn/ui (only if needed for clean cards/buttons — max 3–4 components).
Vercel KV for storing current ideas list + vote counts (simple key-value).
Direct GLM 5.1 calls via https://api.z.ai/api/paas/v4/chat/completions (regular endpoint, not the coding endpoint).
Deployment: Vercel Hobby (free tier only).

GLM Usage Rules:Minimize API calls (respect your $30 monthly Pro plan limits and hourly/weekly quotas).
Generate fresh ideas and build winner only during off-peak hours.
Use one powerful multi-step agent prompt for vote analysis + winner selection + full code generation (to save tokens).
Store generated ideas in Vercel KV so the frontend can show them without constant calls.

No login / No auth — Everything anonymous. Simple IP-based rate limiting for votes.
Output Style for Generated Apps:Single HTML file with Tailwind via CDN.
Fully interactive (vanilla JS).
Clean, modern, dark/light mode friendly.
Ready to copy-paste and run standalone.

4. User Flow (Clear Demo)Visitor lands on / → sees hero + sponsor card.
Clicks “Go to Arena” → lands on /arena.
Votes on ideas ( / ).
Clicks “Build Winner” → GLM 5.1 analyzes votes → builds the top idea → shows live preview.
User plays with the generated app, copies code, or asks to improve it.

5. Success Criteria for HackathonReal Use Case: Fast idea validation + instant prototype for builders.
System Depth: GLM 5.1 performs multi-step reasoning (vote analysis → feasibility check → architecture planning → code generation).
Execution Quality: End-to-end reliable flow (vote → build → playable preview).
Clear Demo & Storytelling: “The community voted… GLM 5.1 built it live” — perfect for a 45-second video.
Shareability: Looks impressive on X, easy to screenshot the live preview.

6. Non-Goals (Keep scope tight)No user accounts.
No persistent database (Vercel KV only).
No complex real-time (simple polling or manual refresh is fine).
No backend-heavy features.



