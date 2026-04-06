# VoteToShip

VoteToShip is a public web app where AI proposes product ideas, users vote by swiping (`X` or `Love`), and anyone can instantly generate a working output for any idea.
Each build produces **two separate HTML deliverables**:
1. `landing_html` (marketing page)
2. `app_html` (interactive MVP)

If an idea was already built, users join the existing build/result instead of paying generation cost again.

## Who It Is For
- Indie hackers validating product concepts quickly
- Hackathon teams who need demo-ready artifacts fast
- Product/design teams exploring many ideas before coding full stacks

## Core Features
- AI-generated app ideas feed
- Swipe voting UX on desktop and mobile
- Build any idea at any time (not only top-voted)
- Live generation stream with concise model reasoning
- Cached builds by exact `ideaId`
- History gallery of completed builds
- Copy/download HTML output directly

## Tech Stack
- Next.js 16 (App Router + TypeScript)
- GLM 5.1 (`api.z.ai` coding endpoint)
- Supabase (ideas, votes, builds, history)

## Install and Run
1. Install dependencies:
```bash
npm install
```

2. Create `.env.local`:
```env
GLM_API_KEY=your_glm_api_key
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. Create database schema:
- Open Supabase SQL Editor
- Run [`supabase/schema.sql`](./supabase/schema.sql)

4. Start locally:
```bash
npm run dev
```

5. Open:
- `http://localhost:3000/arena` for voting/build

## How GLM 5.1 Is Used (and Why)
GLM 5.1 powers two critical stages in VoteToShip: idea generation and build generation. First, the app calls GLM 5.1 to create a fresh set of practical, buildable web app ideas. This keeps each battle novel without requiring manual curation. Second, when a user clicks Build, GLM 5.1 generates a structured payload containing concise reasoning plus two complete HTML artifacts: a landing page and an MVP app. We intentionally constrain outputs to standalone HTML plus Tailwind CDN plus vanilla JavaScript so results are portable, easy to preview in an iframe, and easy to download or copy.

GLM 5.1 was chosen because this product needs both creative ideation and reliable code synthesis in one pipeline. The model is used with low-to-moderate temperature for predictable structure, while streaming is enabled to provide a live "AI at work" experience. To reduce token usage and latency, we store build outputs in Supabase and key cache by exact `ideaId`; if a build already exists (or is currently running), users receive the existing stream/result instead of triggering a duplicate generation. This makes the system cheaper, faster for repeated traffic, and more consistent for collaborative voting sessions.

## Architecture Diagram
```mermaid
flowchart TD
  U[User] --> A[/arena Swipe UI]
  A -->|GET| IAPI[/api/ideas]
  A -->|POST vote| VAPI[/api/vote]
  A -->|GET poll| VAPI
  A -->|Build ideaId| BUI[/build?ideaId=...]
  BUI -->|SSE stream| BAPI[/api/build]
  BAPI --> GLM[GLM 5.1 API]
  IAPI --> DB[(Supabase)]
  VAPI --> DB
  BAPI --> DB
  DB --> HAPI[/api/history]
  DB --> AAPP[/api/apps/[slug]]
  AAPP --> VIEW[/app/[slug] Landing/MVP Toggle Viewer]
  HAPI --> H[/history]
```

## API Overview
- `GET /api/ideas` -> fetch active battle ideas
- `POST /api/ideas` -> start clean battle with new AI ideas
- `GET /api/vote` -> fetch current vote map
- `POST /api/vote` -> cast/update a swipe vote
- `GET /api/build?ideaId=...` -> build stream + cache/join behavior
- `GET /api/apps/[slug]` -> fetch built landing/MVP payload
- `GET /api/history` -> fetch completed builds

## Screenshots / GIF
Add screenshots or a short demo GIF in this section before submission for stronger presentation.
