# VoteToShip

> Community votes on web app ideas → The winner gets built live by GLM 5.1

Built for the **Build with GLM 5.1 Challenge**.

## What It Does

1. **Landing Page** (`/`) — Explains the concept with a clean Vercel-inspired design
2. **Arena** (`/arena`) — Browse 5 GLM-generated web app ideas, upvote/downvote, then hit "Build Winner"
3. **GLM Builds** — Two GLM API calls: one to analyze votes & pick the winner, another to generate a complete single-file HTML app
4. **Live Preview** — Play with the generated app in an iframe, copy the full code

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **GLM 5.1** via `api.z.ai/api/paas/v4/chat/completions`
- **@vercel/kv** for persistent storage (with in-memory fallback for local dev)
- **Vercel** for deployment

## Replicate This Project

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd votetoship
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file:

```env
GLM_API_KEY=your_glm_api_key_here
```

Optional (for persistent storage on Vercel):
```env
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token
KV_REST_API_READ_ONLY_TOKEN=your_kv_readonly_token
```

> Without KV vars, the app uses an in-memory store (data resets on server restart).

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Add your GLM API key as env var
echo "your_glm_api_key" | vercel env add GLM_API_KEY production
echo "your_glm_api_key" | vercel env add GLM_API_KEY preview
echo "your_glm_api_key" | vercel env add GLM_API_KEY development

# Deploy
vercel --prod
```

### 5. (Optional) Add Vercel KV for Persistence

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Create Database** → select **Redis (Upstash)**
3. Link it to your `votetoship` project
4. The KV env vars will be auto-injected into your deployments

### 6. Disable Deployment Protection

If your Vercel project has authentication protection enabled:
1. Go to Vercel dashboard → your project → **Settings** → **Deployment Protection**
2. Set to **Disabled** (or "Only Preview Deployments")
3. Redeploy: `vercel --prod`

## Project Structure

```
app/
├── layout.tsx              # Root layout (Inter font, Vercel-style)
├── page.tsx                # Landing page
├── globals.css             # Tailwind + Vercel design tokens
├── arena/
│   └── page.tsx            # Main arena — client component
└── api/
    ├── ideas/route.ts      # GET/POST — fetch or generate ideas via GLM
    ├── vote/route.ts       # GET/POST — read votes or cast a vote
    └── build/route.ts      # GET/POST — read last build or trigger new build
lib/
├── glm.ts                  # GLM 5.1 API client wrapper
├── kv.ts                   # Storage layer (Vercel KV + in-memory fallback)
└── prompts.ts              # Prompt templates for idea gen, vote analysis, codegen
```

## GLM API Flow

**Generate Ideas** (1 call):
- System: creative web app idea generator
- Returns: 5 ideas with title + description

**Build Winner** (2 calls):
1. **Vote Analysis** — Analyzes all ideas with vote counts, picks the best candidate
2. **Code Generation** — Generates a complete single-file HTML app with Tailwind CDN + vanilla JS

## Design System

Vercel-inspired UI:
- Light mode, `#F9F9F9` background
- Inter font family
- 4px grid spacing
- `#000001` accent color for buttons/links
- `#C8CDD1` borders, `#797979` secondary text
- 22px pill-radius buttons, 6px card radius

## License

MIT
