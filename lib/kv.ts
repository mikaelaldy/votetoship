export interface Idea {
  id: string;
  title: string;
  description: string;
  source?: "glm" | "user";
  roundId?: string;
}

export interface VoteData {
  up: number;
  down: number;
}

export interface BuiltAppRecord {
  slug: string;
  title: string;
  reasoning: string;
  html: string;
  builtAt: number;
  roundId?: string;
}

export type RoundStatus =
  | "OPEN_VOTING"
  | "BUILDING"
  | "SHOWCASE"
  | "ERROR";

export interface RoundRecord {
  id: string;
  status: RoundStatus;
  startsAt: number;
  endsAt: number;
  buildStartedAt?: number;
  buildCompletedAt?: number;
  winnerIdeaId?: string;
  winnerSlug?: string;
  buildError?: string;
}

export interface IdeaSubmission {
  id: string;
  title: string;
  description: string;
  submittedAt: number;
  sourceIpHash: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  moderationReason?: string;
}

const hasKV =
  typeof process !== "undefined" && !!process.env.KV_REST_API_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kv: any = null;

async function getKv() {
  if (!kv) {
    kv = await import("@vercel/kv");
  }
  return kv;
}

const memoryStore = new Map<string, unknown>();
const memoryExpiry = new Map<string, number>();

function memGet<T>(key: string): T | null {
  const exp = memoryExpiry.get(key);
  if (exp && Date.now() > exp) {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    return null;
  }
  return (memoryStore.get(key) as T) ?? null;
}

function memSet(key: string, value: unknown, ttlSeconds?: number) {
  memoryStore.set(key, value);
  if (ttlSeconds) {
    memoryExpiry.set(key, Date.now() + ttlSeconds * 1000);
  }
}

function memDel(key: string) {
  memoryStore.delete(key);
  memoryExpiry.delete(key);
}

const KEYS = {
  roundActive: "round:active",
  ideasCurrent: "ideas:current",
  votes: (roundId: string, ideaId: string) => `votes:${roundId}:${ideaId}`,
  history: "history:apps",
  submissions: "ideas:submissions",
  rateVote: (ip: string, roundId: string, ideaId: string) =>
    `ratelimit:vote:${ip}:${roundId}:${ideaId}`,
  rateSubmit: (ip: string) => `ratelimit:submit:${ip}`,
  lock: (name: string) => `lock:${name}`,
} as const;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function generateRoundId(): string {
  return `round_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getRoundDurationsMs() {
  const votingMinutes = Math.max(
    1,
    Number(process.env.ROUND_VOTING_MINUTES ?? 10)
  );
  const showcaseMinutes = Math.max(
    1,
    Number(process.env.ROUND_SHOWCASE_MINUTES ?? 2)
  );
  return {
    votingMs: votingMinutes * 60_000,
    showcaseMs: showcaseMinutes * 60_000,
  };
}

export async function acquireLock(
  name: string,
  ttlSeconds = 50
): Promise<boolean> {
  const key = KEYS.lock(name);
  if (hasKV) {
    const kv = await getKv();
    const ok = await kv.set(key, "1", { nx: true, ex: ttlSeconds });
    return ok === "OK";
  }
  const exists = memGet<string>(key);
  if (exists) return false;
  memSet(key, "1", ttlSeconds);
  return true;
}

export async function releaseLock(name: string): Promise<void> {
  const key = KEYS.lock(name);
  if (hasKV) {
    const kv = await getKv();
    await kv.del(key);
    return;
  }
  memDel(key);
}

export async function getActiveRound(): Promise<RoundRecord | null> {
  if (hasKV) {
    const kv = await getKv();
    return (await kv.get(KEYS.roundActive)) as RoundRecord | null;
  }
  return memGet<RoundRecord>(KEYS.roundActive);
}

export async function setActiveRound(round: RoundRecord): Promise<void> {
  if (hasKV) {
    const kv = await getKv();
    await kv.set(KEYS.roundActive, round);
    return;
  }
  memSet(KEYS.roundActive, round);
}

export async function updateActiveRound(
  patch: Partial<RoundRecord>
): Promise<RoundRecord | null> {
  const current = await getActiveRound();
  if (!current) return null;
  const updated = { ...current, ...patch };
  await setActiveRound(updated);
  return updated;
}

export async function getIdeas(): Promise<Idea[]> {
  if (hasKV) {
    const kv = await getKv();
    const ideas = (await kv.get(KEYS.ideasCurrent)) as Idea[] | null;
    return ideas || [];
  }
  return memGet<Idea[]>(KEYS.ideasCurrent) || [];
}

export async function setIdeas(ideas: Idea[]): Promise<void> {
  if (hasKV) {
    const kv = await getKv();
    await kv.set(KEYS.ideasCurrent, ideas);
    return;
  }
  memSet(KEYS.ideasCurrent, ideas);
}

export async function getVotes(
  ideaId: string,
  roundId?: string
): Promise<VoteData> {
  const activeRoundId = roundId ?? (await getActiveRound())?.id;
  if (!activeRoundId) return { up: 0, down: 0 };

  const key = KEYS.votes(activeRoundId, ideaId);
  if (hasKV) {
    const kv = await getKv();
    const votes = (await kv.get(key)) as VoteData | null;
    return votes || { up: 0, down: 0 };
  }
  return memGet<VoteData>(key) || { up: 0, down: 0 };
}

export async function getAllVotes(
  ideas: Idea[],
  roundId?: string
): Promise<Record<string, VoteData>> {
  const activeRoundId = roundId ?? (await getActiveRound())?.id;
  if (!activeRoundId) {
    return Object.fromEntries(ideas.map((idea) => [idea.id, { up: 0, down: 0 }]));
  }

  if (hasKV) {
    const kv = await getKv();
    const pipeline = ideas.map((idea) => ({
      id: idea.id,
      votes: (kv.get(KEYS.votes(activeRoundId, idea.id))) as Promise<VoteData | null>,
    }));
    const results = await Promise.all(pipeline.map((p) => p.votes));
    const map: Record<string, VoteData> = {};
    pipeline.forEach((p, i) => {
      map[p.id] = results[i] || { up: 0, down: 0 };
    });
    return map;
  }

  const map: Record<string, VoteData> = {};
  for (const idea of ideas) {
    map[idea.id] =
      memGet<VoteData>(KEYS.votes(activeRoundId, idea.id)) || { up: 0, down: 0 };
  }
  return map;
}

export async function callVote(
  ideaId: string,
  direction: "up" | "down",
  ip: string
): Promise<Record<string, VoteData>> {
  const round = await getActiveRound();
  const ideas = await getIdeas();
  if (!round || round.status !== "OPEN_VOTING") {
    return getAllVotes(ideas, round?.id);
  }

  if (hasKV) {
    const kv = await getKv();
    const rateKey = KEYS.rateVote(ip, round.id, ideaId);
    const pipeline = kv.pipeline();
    pipeline.incr(rateKey);
    pipeline.expire(rateKey, 60);
    const results = await pipeline.exec();
    const count = results[0] as number;
    if (count > 10) {
      return getAllVotes(ideas, round.id);
    }
  }

  const key = KEYS.votes(round.id, ideaId);
  const current = await getVotes(ideaId, round.id);
  const updated =
    direction === "up"
      ? { up: current.up + 1, down: current.down }
      : { up: current.up, down: current.down + 1 };

  if (hasKV) {
    const kv = await getKv();
    await kv.set(key, updated);
  } else {
    memSet(key, updated);
  }

  return getAllVotes(ideas, round.id);
}

export async function saveAppToHistory(app: BuiltAppRecord): Promise<void> {
  if (hasKV) {
    const kv = await getKv();
    await kv.lpush(KEYS.history, JSON.stringify(app));
    return;
  }
  const history = memGet<BuiltAppRecord[]>(KEYS.history) || [];
  history.unshift(app);
  memSet(KEYS.history, history);
}

export async function getAppHistory(): Promise<BuiltAppRecord[]> {
  if (hasKV) {
    const kv = await getKv();
    const items = await kv.lrange(KEYS.history, 0, 49);
    return items.map((item: string) => JSON.parse(item) as BuiltAppRecord);
  }
  return memGet<BuiltAppRecord[]>(KEYS.history) || [];
}

export async function getAppBySlug(slug: string): Promise<BuiltAppRecord | null> {
  const history = await getAppHistory();
  return history.find((app) => app.slug === slug) ?? null;
}

export async function clearBattleState(): Promise<void> {
  const round = await getActiveRound();
  const ideas = await getIdeas();
  if (hasKV) {
    const kv = await getKv();
    const pipeline = kv.pipeline();
    pipeline.del(KEYS.ideasCurrent);
    if (round) {
      for (const idea of ideas) {
        pipeline.del(KEYS.votes(round.id, idea.id));
      }
    }
    await pipeline.exec();
    return;
  }
  memDel(KEYS.ideasCurrent);
  if (round) {
    for (const idea of ideas) {
      memDel(KEYS.votes(round.id, idea.id));
    }
  }
}

export async function getSubmissions(): Promise<IdeaSubmission[]> {
  if (hasKV) {
    const kv = await getKv();
    const submissions = (await kv.get(KEYS.submissions)) as IdeaSubmission[] | null;
    return submissions || [];
  }
  return memGet<IdeaSubmission[]>(KEYS.submissions) || [];
}

export async function setSubmissions(submissions: IdeaSubmission[]): Promise<void> {
  if (hasKV) {
    const kv = await getKv();
    await kv.set(KEYS.submissions, submissions);
    return;
  }
  memSet(KEYS.submissions, submissions);
}

export async function addSubmission(input: {
  title: string;
  description: string;
  sourceIpHash: string;
}): Promise<IdeaSubmission> {
  const submissions = await getSubmissions();
  const now = Date.now();
  const submission: IdeaSubmission = {
    id: `sub_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    description: input.description,
    submittedAt: now,
    sourceIpHash: input.sourceIpHash,
    status: "PENDING",
  };
  submissions.unshift(submission);
  await setSubmissions(submissions);
  return submission;
}

export async function rateLimitSubmit(ipHash: string): Promise<boolean> {
  const key = KEYS.rateSubmit(ipHash);
  if (hasKV) {
    const kv = await getKv();
    const pipeline = kv.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, 3600);
    const results = await pipeline.exec();
    const count = results[0] as number;
    return count <= 3;
  }

  const current = (memGet<number>(key) || 0) + 1;
  memSet(key, current, 3600);
  return current <= 3;
}

export async function updateSubmissionStatus(
  id: string,
  status: IdeaSubmission["status"],
  moderationReason?: string
): Promise<void> {
  const submissions = await getSubmissions();
  const next = submissions.map((s) =>
    s.id === id ? { ...s, status, moderationReason } : s
  );
  await setSubmissions(next);
}

export async function getPendingSubmissions(): Promise<IdeaSubmission[]> {
  const submissions = await getSubmissions();
  return submissions.filter((s) => s.status === "PENDING");
}

export async function getApprovedSubmissions(limit = 10): Promise<IdeaSubmission[]> {
  const submissions = await getSubmissions();
  return submissions
    .filter((s) => s.status === "APPROVED")
    .sort((a, b) => a.submittedAt - b.submittedAt)
    .slice(0, limit);
}

export async function deleteVotesForRound(roundId: string, ideas: Idea[]) {
  if (hasKV) {
    const kv = await getKv();
    const pipeline = kv.pipeline();
    for (const idea of ideas) {
      pipeline.del(KEYS.votes(roundId, idea.id));
    }
    await pipeline.exec();
    return;
  }
  for (const idea of ideas) {
    memDel(KEYS.votes(roundId, idea.id));
  }
}
