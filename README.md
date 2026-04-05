# VoteToShip

> Community votes on web app ideas. GLM 5.1 builds the winner live.

Built for the **Z.ai Builder Sprint — Build with GLM 5.1** (Mar 31 – Apr 6, 2026).

**[Live Demo](https://votetoship.vercel.app)** · **[X Thread](https://x.com/placeholder)**

---

## What It Does

VoteToShip is a real-time agentic web app where the community decides what gets built, and GLM 5.1 ships it as a playable app in seconds. All votes and built apps are synchronized globally via Firebase Realtime Database.

1. **Generate Ideas** — GLM 5.1 creates 5 creative, buildable web app ideas
2. **Vote** — Upvote/downvote anonymously (no login), votes sync globally in real-time
3. **Build Winner** — Two GLM 5.1 calls: one analyzes votes and picks the winner, the second generates a complete interactive web app
4. **Play** — Interact with the generated app live in an iframe, copy the code, download as .html
5. **History** — All past winners are saved and browsable at `/history`

### Why this showcases GLM 5.1

VoteToShip is not another idea generator. It demonstrates GLM 5.1's strengths in **multi-step reasoning** and **code generation**:

- **Long-horizon reasoning**: The model analyzes community votes, weighs feasibility vs popularity, and makes a judgment call on which idea to build
- **Full-stack code generation**: Produces a complete, working single-file HTML app with Tailwind CSS, vanilla JS, and embedded styles — ready to run
- **Agentic workflow**: Two sequential GLM calls form a pipeline — vote analysis → code generation — with context passed between them
- **Real output**: Not a demo or mock — the generated apps are fully interactive and playable

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4)
- **GLM 5.1** via `api.z.ai/api/coding/paas/v4/chat/completions` (Coding Plan endpoint)
- **Firebase Realtime Database** for global state sync (ideas, votes, built apps)
- **Vercel** for deployment

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/aldy1205/votetoship.git
cd votetoship
npm install
```

### 2. Set Up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Go to **Realtime Database** → **Create Database** → start in **test mode**
4. Go to **Project Settings** → **General** → scroll to **Your apps** → click the **Web** icon
5. Copy the config values

### 3. Set Up Environment Variables

Create a `.env.local` file:

```env
GLM_API_KEY=your_glm_api_key_here

NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Add env vars
vercel env add GLM_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_DATABASE_URL production
# ... add all Firebase vars

# Deploy
vercel --prod
```

## Project Structure

```
app/
├── layout.tsx              Root layout (Inter font)
├── page.tsx                Landing page
├── globals.css             Tailwind + design tokens
├── arena/
│   └── page.tsx            Battle arena — Firebase realtime votes, auto-build
├── build/
│   └── page.tsx            Watch GLM 5.1 write code live, auto-redirects to /app/[slug]
├── app/[slug]/
│   └── page.tsx            Individual built app — preview, download, copy
├── history/
│   └── page.tsx            Gallery of all past built apps
├── next/
│   └── page.tsx            Roadmap page
└── api/
    ├── ideas/route.ts      POST generates ideas via GLM, saves to Firebase
    └── build/route.ts      SSE streaming — reads from Firebase, saves to Firebase
lib/
├── firebase.ts             Firebase client initialization (lazy)
├── db.ts                   All database functions (ideas, votes, apps, realtime listeners)
├── glm.ts                  GLM 5.1 client (coding endpoint, streaming)
├── prompts.ts              Prompt templates
└── storage.ts              slugify helper + BuiltApp type
```

## Route Map

| Route | What |
|---|---|
| `/` | Landing page with hero + CTA |
| `/arena` | Battle arena — auto-generates ideas, realtime votes, auto-builds after all voted |
| `/build` | Watch GLM 5.1 write code in real-time (terminal + timer + blinking cursor) |
| `/app/[slug]` | Individual app page — preview iframe, download .html, copy code |
| `/history` | Gallery of all past winners with download links |
| `/next` | Roadmap — what's planned next |

## GLM 5.1 Integration

### Endpoint

The app uses the **Coding Plan endpoint** (`api.z.ai/api/coding/paas/v4/chat/completions`) with model `GLM-5.1`.

### API Flow

**Generate Ideas** (1 call):
- Prompt asks for 5 diverse, creative web app ideas
- Returns JSON array with title + description
- Saves to Firebase `currentBattle/ideas`

**Build Winner** (2 sequential calls via streaming SSE):
1. **Vote Analysis** — Reads ideas + votes from Firebase, picks the best candidate. Returns `{ winnerId, reasoning }`
2. **Code Generation** — Streams HTML code in real-time. Saves to Firebase `apps/{slug}`

### Streaming

The `/api/build` route uses Server-Sent Events (SSE) with `maxDuration = 300` (5 min timeout). The client receives events: `status`, `analysis`, `code`, `done`, `error`.

## Firebase Database Structure

```
currentBattle/
  ideas: [ { id, title, description }, ... ]
  createdAt: number
  status: "active" | "building" | "finished"
votes/
  {ideaId}/
    up: number
    down: number
apps/
  {slug}/
    title: string
    reasoning: string
    html: string
    builtAt: number
```

## Design System

Vercel-inspired light UI:
- `#F9F9F9` background, `#000001` accents
- Inter font, 4px grid
- `#C8CDD1` borders, `#797979` secondary text
- 22px pill buttons, 6px card radius
- WINNING badge on highest-voted idea

## License

MIT
