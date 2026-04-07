# VoteToShip — Product Requirements Document

## 1. Product Overview

**VoteToShip** is a community-driven web app where users swipe-vote on SaaS ideas and the crowd favorite gets built live as a fully working prototype by GLM 5.1.

**Tagline:** "Vote on web app ideas → the winner gets built live by GLM 5.1."

### 1.1 Target Users

| Persona | Pain Point | How VoteToShip Helps |
|---------|-----------|---------------------|
| Indie hackers | Idea validation takes days of pitching and waiting for feedback | Get real-time community signal in minutes through swipe voting |
| Hackathon teams | Choosing what to build wastes time in committee discussions | Let the crowd decide — build what people actually want |
| Product communities | Idea threads get long and noisy, hard to see what's popular | Clean leaderboard with Love/X voting surfaces the best ideas |
| Curious builders | Want to see AI code generation in action | Watch GLM 5.1 stream a complete app from scratch in real time |

### 1.2 Core Value Proposition

Traditional idea validation: Write pitch → Share on social → Wait days → Maybe get feedback → Repeat.

VoteToShip: Generate ideas → Community swipes → Winner gets built live → Playable prototype in < 2 minutes.

---

## 2. Features (As Implemented)

### 2.1 Landing Page (`/`)

Static marketing page with:
- Hero section with tagline and CTA buttons
- "How it works" — 3-step explanation (Swipe → Rank → Ship)
- Final CTA to enter the arena
- Footer with links to leaderboard and build history

### 2.2 Arena (`/arena`)

The core swipe-to-vote experience:
- **Card stack UI** — One idea at a time, swipeable left (X) or right (Love)
- **Pointer-based swipe** — Works on mobile touch and desktop mouse/trackpad
- **Drag threshold** — 96px minimum swipe to commit a vote
- **Visual feedback** — Card rotates and fades during swipe, X/Love labels fade in
- **Vote tallies** — Real-time vote counters with 3-second polling
- **Build gate** — Ideas need 5 Love votes to unlock the "Build" button
- **Auto-refill** — When ≤ 2 ideas remain, a fresh batch of 12 is generated via GLM 4.7 Flash
- **Admin mode** — Token-based admin can boost votes, delete ideas, or reset demo data

### 2.3 Build Stream (`/build?ideaId=xxx`)

Live code generation viewer:
- **Two-phase generation** — Landing page HTML first, then MVP app HTML (sequential)
- **Server-Sent Events** — Real-time SSE stream from the API route
- **Code viewer** — Lightweight `<pre>` during streaming, SyntaxHighlighter (Prism) after completion
- **Auto-scroll** — Code panel sticks to bottom during active streaming
- **Live preview** — iframe with `srcDoc` renders the HTML as it streams
- **Tab switching** — Toggle between Landing HTML and App HTML views
- **Actions** — Copy to clipboard, download as `.html`, stop build
- **Retry/rebuild** — Retry failed builds or force-rebuild completed ones
- **Build resume** — Late joiners can follow an in-progress build via DB polling
- **Timer** — Elapsed time counter shows build duration

### 2.4 Leaderboard (`/leaderboard`)

- Ranked list of all active ideas sorted by net votes (Love − X)
- Vote counts per idea
- Direct "Build" button for ideas that meet the threshold

### 2.5 Build History (`/history`)

- List of all completed builds with timestamps
- Links to view the generated landing page and MVP app

### 2.6 App Viewer (`/app/[slug]`)

- Renders a completed build's HTML in a full-page iframe
- Toggle between landing page and MVP app views

### 2.7 Admin (`/admin`)

- Token-authenticated admin panel
- Boost votes, delete ideas, reset demo data, manage builds

---

## 3. Technical Architecture

### 3.1 Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Framework | Next.js 16 (App Router) | SSE streaming from API routes, React Server Components for static pages |
| UI | React 19 + Tailwind CSS 4 | Fast client-side interactivity, utility-first styling |
| Database | Supabase (PostgreSQL) | Free tier, real-time capable, simple REST API |
| AI — Build | GLM 5.1 (Z.AI Coding API) | Long-context code generation with streaming support |
| AI — Ideas | GLM 4.7 Flash | Fast, cheap structured JSON generation |
| Hosting | Vercel | Zero-config Next.js deployment, serverless functions |

### 3.2 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ideas` | GET | Fetch current idea batch |
| `/api/ideas` | POST | Generate new batch via GLM 4.7 Flash |
| `/api/vote` | GET | Get vote tallies |
| `/api/vote` | POST | Cast a vote (IP + token deduped) |
| `/api/build` | GET | SSE stream — generates landing + MVP HTML via GLM 5.1 |
| `/api/builds` | GET | List recent builds |
| `/api/history` | GET | List completed builds |
| `/api/admin` | POST | Admin actions |
| `/api/health` | GET | Health check |

### 3.3 Database Schema

Five tables in Supabase PostgreSQL:

- **`app_state`** — Singleton row tracking the active battle (idea batch) ID
- **`idea_battles`** — Groups of ideas generated per round
- **`ideas`** — Individual ideas (title, description, source: `glm` or `user`)
- **`votes`** — One vote per `(idea_id, voter_key)` pair, direction is `up` or `down`
- **`builds`** — Generated HTML output with status tracking (`building` → `completed` | `failed`)

### 3.4 GLM Integration

**Idea generation (`glm-4.7-flash`):**
- System prompt: startup product strategist persona
- User prompt: structured request for 12 SaaS ideas as JSON array
- Fallback: 12 hardcoded ideas if the API call fails
- Temperature: 0.7

**Code generation (`GLM-5.1`):**
- Two sequential calls per build (landing page, then MVP app)
- System prompt: expert web developer, return only valid HTML
- User prompt: detailed requirements for a Tailwind + vanilla JS single-file app
- Temperature: 0.1 (deterministic for code quality)
- `max_tokens`: 65,536
- Streaming via SSE with `stream: true`
- Retry logic: if first attempt returns incomplete HTML, retries with tighter constraints (< 450 lines)
- Output validation: checks for `<!DOCTYPE html>` at start and `</html>` at end

### 3.5 Key Performance Optimizations

1. **Throttled DB writes** — Build output is persisted to Supabase every 3 seconds instead of per-chunk, avoiding hundreds of sequential round-trips that would bottleneck the stream.
2. **Lightweight streaming UI** — Uses plain `<pre>` during active streaming; SyntaxHighlighter (Prism) only activates after stream completion to avoid expensive re-tokenization on every chunk.
3. **GLM model selection** — Uses the lighter `glm-4.7-flash` for idea generation (fast, cheap) and reserves full `GLM-5.1` for code generation where quality matters.

---

## 4. User Flow

```
Landing (/)
  │
  ├─→ "Start Voting" → Arena (/arena)
  │                        │
  │                        ├─→ Swipe Left (X) → next idea
  │                        ├─→ Swipe Right (Love) → next idea + increment vote
  │                        ├─→ "Build" (≥5 Love) → Build Stream (/build)
  │                        │                           │
  │                        │                           ├─→ Phase 1: Landing HTML streams
  │                        │                           ├─→ Phase 2: MVP App HTML streams
  │                        │                           └─→ Done → App Viewer (/app/[slug])
  │                        │
  │                        └─→ All voted → Leaderboard (/leaderboard)
  │
  ├─→ "Leaderboard" → Leaderboard (/leaderboard)
  │                        └─→ "Build" → Build Stream
  │
  └─→ "History" → Build History (/history)
                       └─→ View build → App Viewer (/app/[slug])
```

---

## 5. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GLM_API_KEY` | Yes | Z.AI API key for GLM models |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ADMIN_TOKEN` | No | Admin authentication token (default: `mikacend-demo`) |

---

## 6. Constraints & Non-Goals

- **No user accounts** — Everything is anonymous. Votes are deduplicated via IP + client token hash.
- **No persistent user data** — No profiles, no saved preferences.
- **No WebSocket** — SSE and polling are sufficient; keeps the stack simple.
- **No complex real-time** — 3-second polling for vote updates, not pub/sub.
- **Generated apps are static** — Single HTML files with Tailwind CDN and vanilla JS. No server-side logic.
- **Vercel serverless limits** — API routes have a 300-second max duration for builds.
