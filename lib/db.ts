import {
  ref,
  get,
  set,
  remove,
  onValue,
  runTransaction,
} from "firebase/database";
import { getDb } from "@/lib/firebase";
import { slugify } from "@/lib/storage";

export interface Idea {
  id: string;
  title: string;
  description: string;
}

export interface BuiltApp {
  slug: string;
  title: string;
  reasoning: string;
  html: string;
  builtAt: number;
}

export async function getCurrentIdeas(): Promise<Idea[]> {
  const snapshot = await get(ref(getDb(), "currentBattle/ideas"));
  const val = snapshot.val();
  if (!val) return [];
  return Array.isArray(val) ? val : Object.values(val);
}

export async function setCurrentIdeas(ideas: Idea[]): Promise<void> {
  await set(ref(getDb(), "currentBattle"), {
    ideas,
    createdAt: Date.now(),
    status: "active",
  });
  await remove(ref(getDb(), "votes"));
}

export async function getVotes(): Promise<
  Record<string, { up: number; down: number }>
> {
  const snapshot = await get(ref(getDb(), "votes"));
  const val = snapshot.val();
  if (!val) return {};
  const result: Record<string, { up: number; down: number }> = {};
  for (const [id, votes] of Object.entries(val)) {
    const v = votes as { up?: number; down?: number };
    result[id] = { up: v?.up ?? 0, down: v?.down ?? 0 };
  }
  return result;
}

export async function castVote(
  ideaId: string,
  direction: "up" | "down"
): Promise<void> {
  const voteRef = ref(getDb(), `votes/${ideaId}/${direction}`);
  await runTransaction(voteRef, (current) => {
    return (current || 0) + 1;
  });
}

export async function saveBuiltApp(
  slug: string,
  title: string,
  reasoning: string,
  html: string
): Promise<void> {
  await set(ref(getDb(), `apps/${slug}`), {
    title,
    reasoning,
    html,
    builtAt: Date.now(),
  });
}

export async function getBuiltApp(
  slug: string
): Promise<BuiltApp | null> {
  const snapshot = await get(ref(getDb(), `apps/${slug}`));
  const val = snapshot.val();
  if (!val) return null;
  return { slug, title: val.title, reasoning: val.reasoning, html: val.html, builtAt: val.builtAt };
}

export async function getAllBuiltApps(): Promise<BuiltApp[]> {
  const snapshot = await get(ref(getDb(), "apps"));
  const val = snapshot.val();
  if (!val) return [];
  return Object.entries(val)
    .map(([slug, data]: [string, any]) => ({
      slug,
      title: data.title,
      reasoning: data.reasoning,
      html: data.html,
      builtAt: data.builtAt,
    }))
    .sort((a, b) => b.builtAt - a.builtAt);
}

export function subscribeToVotes(
  callback: (votes: Record<string, { up: number; down: number }>) => void
): () => void {
  const votesRef = ref(getDb(), "votes");
  return onValue(votesRef, (snapshot) => {
    const val = snapshot.val();
    if (!val) {
      callback({});
      return;
    }
    const result: Record<string, { up: number; down: number }> = {};
    for (const [id, votes] of Object.entries(val)) {
      const v = votes as { up?: number; down?: number };
      result[id] = { up: v?.up ?? 0, down: v?.down ?? 0 };
    }
    callback(result);
  });
}

export function subscribeToIdeas(
  callback: (ideas: Idea[]) => void
): () => void {
  const ideasRef = ref(getDb(), "currentBattle/ideas");
  return onValue(ideasRef, (snapshot) => {
    const val = snapshot.val();
    if (!val) {
      callback([]);
      return;
    }
    callback(Array.isArray(val) ? val : Object.values(val));
  });
}

export async function updateBattleStatus(status: string): Promise<void> {
  await set(ref(getDb(), "currentBattle/status"), status);
}

export async function getBattleStatus(): Promise<string> {
  const snapshot = await get(ref(getDb(), "currentBattle/status"));
  return snapshot.val() ?? "active";
}
