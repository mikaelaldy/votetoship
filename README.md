# VoteToShip

> Community votes on web app ideas. GLM 5.1 builds the winner live.

Built for the **Z.ai Builder Sprint — Build with GLM 5.1** (Mar 31 – Apr 6, 2026).

**[Live Demo](https://votetoship.vercel.app)** · **[X Thread](https://x.com/placeholder)**

---

## What It Does

VoteToShip is a real-time agentic web app where the community decides what gets built, and GLM 5.1 ships it as a playable app in seconds.

1. **Generate Ideas** — GLM 5.1 creates 5 creative, buildable web app ideas
2. **Vote** — Upvote/downvote anonymously (no login)
3. **Build Winner** — Two GLM 5.1 calls: one analyzes votes and picks the winner, the second generates a complete interactive web app
4. **Play** — Interact with the generated app live in an iframe, copy the code

### Why this showcases GLM 5.1

VoteToShip is not another idea generator. It demonstrates GLM 5.1's strengths in **multi-step reasoning** and **code generation**:

- **Long-horizon reasoning**: The model analyzes community votes, weighs feasibility vs popularity, and makes a judgment call on which idea to build
- **Full-stack code generation**: Produces a complete, working single-file HTML app with Tailwind CSS, vanilla JS, and embedded styles — ready to run
- **Agentic workflow**: Two sequential GLM calls form a pipeline — vote analysis → code generation — with context passed between them
- **Real output**: Not a demo or mock — the generated apps are fully interactive and playable

## Screenshots

*Landing page: Clean Vercel-style hero explaining the concept*

*Arena: Vote on ideas, build the winner, play the result live*

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4)
- **GLM 5.1** via `api.z.ai/api/coding/paas/v4/chat/completions` (Coding Plan endpoint)
- **localStorage** for client-side persistence (ideas, votes, built apps survive refresh)
- **Vercel** for deployment

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/aldy1205/votetoship.git
cd votetoship
npm install
```

### 2. Set Up Environment

Create `.env.local`:

```env
GLM_API_KEY=your_glm_api_key_here
```

Get your key at [open.bigmodel.cn](https://open.bigmodel.cn).

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
├── layout.tsx              Root layout (Inter font)
├── page.tsx                Landing page
├── globals.css             Tailwind + design tokens
├── arena/
│   └── page.tsx            Main arena — client component with localStorage
└── api/
    ├── ideas/route.ts      POST — generate 5 ideas via GLM 5.1
    └── build/route.ts      POST — analyze votes + generate app (2 GLM calls)
lib/
├── glm.ts                  GLM 5.1 client (coding endpoint, reasoning_content)
├── kv.ts                   Storage layer (unused in current localStorage setup)
└── prompts.ts              Prompt templates for idea gen, vote analysis, codegen
```

## GLM 5.1 Integration

### Endpoint

The app uses the **Coding Plan endpoint** (`api.z.ai/api/coding/paas/v4/chat/completions`) with model `GLM-5.1`. This endpoint provides higher token limits and better code generation compared to the general endpoint.

### API Flow

**Generate Ideas** (1 call):
- Prompt asks for 5 diverse, creative web app ideas
- Returns JSON array with title + description

**Build Winner** (2 sequential calls):
1. **Vote Analysis** — Receives all ideas with vote counts, picks the best candidate based on community enthusiasm + feasibility + fun factor. Returns `{ winnerId, reasoning }`
2. **Code Generation** — Builds a complete single-file HTML app for the winning idea with Tailwind CDN, embedded `<style>` and `<script>`, dark theme, fully interactive

### Handling GLM 5.1 Responses

GLM 5.1 returns both `content` and `reasoning_content` fields. Sometimes `content` is empty and only `reasoning_content` has data. The client handles both:

```ts
return msg?.content || msg?.reasoning_content || "";
```

### Token Usage

- `max_tokens: 16384` for all calls (GLM 5.1 uses tokens for reasoning)
- `temperature: 0.3` for vote analysis (deterministic), `0.4` for code generation (slightly creative)

## Design System

Vercel-inspired light UI:
- `#F9F9F9` background, `#000001` accents
- Inter font, 4px grid
- `#C8CDD1` borders, `#797979` secondary text
- 22px pill buttons, 6px card radius
- LEADING badge on highest-voted idea

## Architecture Decisions

| Decision | Why |
|---|---|
| localStorage over server DB | No auth, no login — voting is anonymous and client-side. Persists across refreshes without backend |
| Two GLM calls for build | Separates reasoning (pick winner) from generation (build app). Cleaner prompts, better results |
| Coding Plan endpoint | General endpoint returns "insufficient balance" errors. Coding endpoint works with the GLM key |
| Single HTML output | Generated apps are self-contained — copy-paste and run anywhere |

## License

MIT
