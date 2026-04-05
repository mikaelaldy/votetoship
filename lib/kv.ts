export interface Idea {
  id: string;
  title: string;
  description: string;
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

const KEYS = {
  ideas: "ideas:current",
  votes: (id: string) => `votes:${id}`,
  history: "history:apps",
  battle: "battle:active",
} as const;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function getIdeas(): Promise<Idea[]> {
  if (hasKV) {
    const kv = await getKv();
    const ideas = (await kv.get(KEYS.ideas)) as Idea[] | null;
    return ideas || [];
  }
  return memGet<Idea[]>(KEYS.ideas) || [];
}

export async function setIdeas(ideas: Idea[]): Promise<void> {
  if (hasKV) {
    const kv = await getKv();
    await kv.set(KEYS.ideas, ideas);
    return;
  }
  memSet(KEYS.ideas, ideas);
}

export async function getVotes(ideaId: string): Promise<VoteData> {
  if (hasKV) {
    const kv = await getKv();
    const votes = (await kv.get(KEYS.votes(ideaId))) as VoteData | null;
    return votes || { up: 0, down: 0 };
  }
  return memGet<VoteData>(KEYS.votes(ideaId)) || { up: 0, down: 0 };
}

export async function getAllVotes(ideas: Idea[]): Promise<Record<string, VoteData>> {
  if (hasKV) {
    const kv = await getKv();
    const pipeline = ideas.map((idea) => ({
      id: idea.id,
      votes: (kv.get(KEYS.votes(idea.id))) as Promise<VoteData | null>,
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
    map[idea.id] = memGet<VoteData>(KEYS.votes(idea.id)) || { up: 0, down: 0 };
  }
  return map;
}

export async function callVote(
  ideaId: string,
  direction: "up" | "down",
  ip: string
): Promise<Record<string, VoteData>> {
  if (hasKV) {
    const kv = await getKv();
    const rateKey = `ratelimit:${ip}:${ideaId}`;
    const pipeline = kv.pipeline();
    pipeline.incr(rateKey);
    pipeline.expire(rateKey, 60);
    const results = await pipeline.exec();
    const count = results[0] as number;
    if (count > 10) {
      return getAllVotes(await getIdeas());
    }
  }
  const current = await getVotes(ideaId);
  const updated =
    direction === "up"
      ? { up: current.up + 1, down: current.down }
      : { up: current.up, down: current.down + 1 };
  if (hasKV) {
    const kv = await getKv();
    await kv.set(KEYS.votes(ideaId), updated);
  } else {
    memSet(KEYS.votes(ideaId), updated);
  }
  return getAllVotes(await getIdeas());
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
  const ideas = await getIdeas();
  if (hasKV) {
    const kv = await getKv();
    const pipeline = kv.pipeline();
    pipeline.del(KEYS.ideas);
    for (const idea of ideas) {
      pipeline.del(KEYS.votes(idea.id));
    }
    await pipeline.exec();
    return;
  }
  memoryStore.delete(KEYS.ideas);
  for (const idea of ideas) {
    memoryStore.delete(KEYS.votes(idea.id));
  }
}
