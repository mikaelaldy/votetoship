export interface Idea {
  id: string;
  title: string;
  description: string;
}

export interface VoteData {
  up: number;
  down: number;
}

const hasKV =
  typeof process !== "undefined" && !!process.env.KV_REST_API_URL;

let kvModule: typeof import("@vercel/kv") | null = null;
async function getKv() {
  if (!kvModule) {
    kvModule = await import("@vercel/kv");
  }
  return kvModule.kv;
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

function memSet(key: string, value: unknown, exSeconds?: number) {
  memoryStore.set(key, value);
  if (exSeconds) {
    memoryExpiry.set(key, Date.now() + exSeconds * 1000);
  }
}

const KEYS = {
  ideas: "ideas:current",
  votes: (id: string) => `votes:${id}`,
  rateLimit: (ip: string, id: string) => `ratelimit:${ip}:${id}`,
  builtHtml: "built:current",
  builtWinnerId: "built:winnerId",
} as const;

export async function getIdeas(): Promise<Idea[]> {
  if (hasKV) {
    const kv = await getKv();
    const ideas = await kv.get<Idea[]>(KEYS.ideas);
    return ideas ?? [];
  }
  return memGet<Idea[]>(KEYS.ideas) ?? [];
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
    const votes = await kv.get<VoteData>(KEYS.votes(ideaId));
    return votes ?? { up: 0, down: 0 };
  }
  return memGet<VoteData>(KEYS.votes(ideaId)) ?? { up: 0, down: 0 };
}

export async function getAllVotes(
  ideas: Idea[]
): Promise<Record<string, VoteData>> {
  if (hasKV) {
    const kv = await getKv();
    const pipeline = kv.pipeline();
    for (const idea of ideas) {
      pipeline.get<VoteData>(KEYS.votes(idea.id));
    }
    const results = await pipeline.exec();
    const map: Record<string, VoteData> = {};
    ideas.forEach((idea, i) => {
      map[idea.id] = (results[i] as VoteData | null) ?? { up: 0, down: 0 };
    });
    return map;
  }
  const map: Record<string, VoteData> = {};
  for (const idea of ideas) {
    map[idea.id] = memGet<VoteData>(KEYS.votes(idea.id)) ?? {
      up: 0,
      down: 0,
    };
  }
  return map;
}

export async function castVote(
  ideaId: string,
  direction: "up" | "down",
  ip: string
): Promise<VoteData> {
  const rateKey = KEYS.rateLimit(ip, ideaId);

  if (hasKV) {
    const kv = await getKv();
    const lastVote = await kv.get(rateKey);
    if (lastVote) {
      throw new Error("Rate limited: wait before voting again on this idea");
    }
    const current = await getVotes(ideaId);
    const updated: VoteData =
      direction === "up"
        ? { ...current, up: current.up + 1 }
        : { ...current, down: current.down + 1 };
    const pipeline = kv.pipeline();
    pipeline.set(KEYS.votes(ideaId), updated);
    pipeline.set(rateKey, Date.now(), { ex: 60 });
    await pipeline.exec();
    return updated;
  }

  const lastVote = memGet(rateKey);
  if (lastVote) {
    throw new Error("Rate limited: wait before voting again on this idea");
  }
  const current = memGet<VoteData>(KEYS.votes(ideaId)) ?? { up: 0, down: 0 };
  const updated: VoteData =
    direction === "up"
      ? { ...current, up: current.up + 1 }
      : { ...current, down: current.down + 1 };
  memSet(KEYS.votes(ideaId), updated);
  memSet(rateKey, Date.now(), 60);
  return updated;
}

export async function getBuiltApp(): Promise<{
  html: string | null;
  winnerId: string | null;
}> {
  if (hasKV) {
    const kv = await getKv();
    const [html, winnerId] = await Promise.all([
      kv.get<string>(KEYS.builtHtml),
      kv.get<string>(KEYS.builtWinnerId),
    ]);
    return { html, winnerId };
  }
  return {
    html: memGet<string>(KEYS.builtHtml),
    winnerId: memGet<string>(KEYS.builtWinnerId),
  };
}

export async function setBuiltApp(
  html: string,
  winnerId: string
): Promise<void> {
  if (hasKV) {
    const kv = await getKv();
    const pipeline = kv.pipeline();
    pipeline.set(KEYS.builtHtml, html);
    pipeline.set(KEYS.builtWinnerId, winnerId);
    await pipeline.exec();
    return;
  }
  memSet(KEYS.builtHtml, html);
  memSet(KEYS.builtWinnerId, winnerId);
}
