# VoteToShip

VoteToShip is a Next.js 16 demo where people swipe on app ideas, push the best concepts up a leaderboard, and then watch the winner get built live with GLM 5.1.

The app has three core loops:

- generate or refresh a battle of 12 ideas
- collect anonymous Love / X votes
- stream a two-step build for the winning idea: a landing page, then an MVP app

## What is in the repo

- `app/page.tsx`: marketing landing page
- `app/arena/page.tsx`: swipe voting flow with local vote tracking
- `app/leaderboard/page.tsx`: ranked active ideas
- `app/build/page.tsx`: live build stream viewer and iframe preview
- `app/history/page.tsx`: in-progress, failed, and completed builds
- `app/app/[slug]/page.tsx`: full-page viewer for a completed build
- `app/admin/page.tsx`: browser-local admin session page
- `app/api/*`: route handlers for ideas, votes, builds, history, admin, and health checks
- `lib/glm.ts`: Z.AI / GLM client for normal and streamed completions
- `lib/store.ts`: Supabase data access layer
- `supabase/schema.sql`: database schema and helper RPC

## Stack

- Next.js `16.2.2`
- React `19.2.4`
- Tailwind CSS `4`
- Supabase for persistence
- GLM `5.1` for HTML generation
- GLM `4.7-flash` for idea generation
- Vercel Analytics

This project is on Next.js 16. The local Next docs in `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md` and `.../02-guides/upgrading/version-16.md` indicate a minimum Node.js version of `20.9.0`.

## Product flow

1. The arena loads the active idea battle from Supabase. If none exists, the server seeds fallback ideas.
2. Users vote anonymously with a hash of `IP + voterToken`, so one browser can only keep one vote per idea.
3. Public builds unlock at `5` Love votes. Admin requests can bypass that threshold.
4. `/api/build` opens an SSE stream and generates two complete standalone HTML documents:
   - landing page HTML
   - MVP app HTML
5. Build output is persisted to Supabase during the stream and can be resumed by later viewers if the build is already running.
6. Completed builds are exposed in history and through `/app/[slug]`.

## Current behavior worth knowing

- Build records use the `ideaId` as the stored `slug` today, even though `lib/store.ts` includes a `slugify()` helper.
- Generated apps are single-file HTML documents rendered with `iframe srcDoc`.
- The build route retries once with tighter output constraints if GLM returns incomplete HTML.
- The arena auto-refreshes the idea batch when there are 2 or fewer unvoted ideas left.
- Admin auth is header-based through `x-admin-token` and also stored locally in the browser for the admin UI.

## Routes

### Pages

- `/`: landing page
- `/arena`: swipe voting interface
- `/leaderboard`: ranked active ideas
- `/build?ideaId=...`: live build stream
- `/history`: build archive
- `/app/[slug]`: completed build viewer
- `/admin`: token-based admin controls

### API

- `GET /api/ideas`: return the active idea battle
- `POST /api/ideas`: generate a fresh 12-idea battle
- `GET /api/vote`: return vote tallies for active ideas
- `POST /api/vote`: cast or replace a vote for one idea
- `GET /api/build?ideaId=...`: stream a build over SSE
- `GET /api/builds`: list recent builds of any status
- `GET /api/history`: list completed builds only
- `POST /api/admin`: admin actions such as `boostIdea`, `deleteIdea`, `deleteBuild`, `ping`, and `resetDemo`
- `GET /api/apps/[slug]`: fetch a build record by slug
- `GET /api/health`: validate required server environment variables

## Database schema

`supabase/schema.sql` creates five tables:

- `app_state`: singleton row containing the active battle id
- `idea_battles`: each generated round of ideas
- `ideas`: individual ideas within a battle
- `votes`: one row per `(idea_id, voter_key)`
- `builds`: streamed build state and final HTML output

It also creates `append_build_stream(p_build_id, p_delta)`, which appends streamed text directly in Postgres.

## Environment variables

Create `.env.local` with:

```env
GLM_API_KEY=your_glm_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_TOKEN=your_admin_token
```

Notes:

- `ADMIN_TOKEN` is optional.
- `SUPABASE_SERVICE_ROLE_KEY` is required because all database access happens server-side through the admin client.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Apply `supabase/schema.sql` in your Supabase SQL editor.

3. Add `.env.local`.

4. Start the dev server:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Build and deployment

```bash
npm run build
npm run start
```

The app is designed for a Node.js runtime and uses server route handlers, streaming responses, and secret server-side environment variables, so it should be deployed as a normal Next.js server app rather than a static export.

## Admin usage

Open `/admin`, enter the admin token, and the browser stores it locally. After that:

- arena and leaderboard can boost or remove ideas
- history can remove builds
- admin page can reset demo data
- build requests can bypass the public upvote threshold

## Development notes

- `lib/store.ts` currently has uncommitted local changes in this workspace. This README update does not alter that file.
- `GET /api/health` only checks for presence and URL shape of required env vars. It does not verify database connectivity or make a live GLM request.
- The build stream is capped by `export const maxDuration = 300` in `app/api/build/route.ts`.

## Feedback

If you have feedback, DM me on Twitter: [@mikaelbuilds](https://twitter.com/mikaelbuilds).

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
