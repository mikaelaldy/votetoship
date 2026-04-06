# VoteToShip

AI recommends app ideas. Users swipe left/right (X/Love). Any idea can be built on demand by GLM into **two separate outputs**:
1. Landing page HTML
2. MVP app HTML

If an idea is already built, users join the existing build stream/result instead of regenerating.

## Stack
- Next.js 16 (App Router, TypeScript)
- GLM 5.1 (`api.z.ai` coding endpoint)
- Supabase (ideas, votes, builds, history)

## Setup
1. Install dependencies
```bash
npm install
```

2. Set environment variables (`.env.local`)
```env
GLM_API_KEY=your_glm_api_key
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. Create database tables
- Open Supabase SQL Editor
- Run: [`supabase/schema.sql`](./supabase/schema.sql)

4. Run dev server
```bash
npm run dev
```

## User Flow
1. Open `/arena`
2. Swipe card left (`X`) or right (`Love`) to vote
3. Press `Build` on any idea (does not require winning)
4. Watch reasoning + code stream in `/build?ideaId=...`
5. Open final viewer with two toggles:
   - `Landing Page`
   - `MVP App`
6. Copy/download HTML
7. Browse cached results in `/history`

## API Overview
- `GET /api/ideas` -> active battle ideas
- `POST /api/ideas` -> start clean battle with new AI ideas
- `GET /api/vote` -> current vote counts
- `POST /api/vote` -> up/down vote for one idea
- `GET /api/build?ideaId=...` -> build stream (leader/follower, cached by exact ideaId)
- `GET /api/apps/[slug]` -> landing+mvp build payload
- `GET /api/history` -> completed build history

## Notes
- Voting sync uses polling (no WebSocket dependency).
- Build stream supports joining an in-progress build for the same idea.
- Cache key is exact `ideaId`.
