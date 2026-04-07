import { getSupabaseAdmin } from "@/lib/supabase";

export interface Idea {
  id: string;
  battle_id: string;
  title: string;
  description: string;
  source: "glm" | "user";
  created_at: string;
}

export interface VoteData {
  up: number;
  down: number;
}

export interface BuildRecord {
  id: string;
  idea_id: string;
  slug: string;
  title: string;
  reasoning: string;
  stream_text: string;
  landing_html: string;
  app_html: string;
  status: "building" | "completed" | "failed";
  error_message: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function getOrCreateActiveBattleId() {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("app_state")
    .select("active_battle_id")
    .eq("id", 1)
    .maybeSingle();

  const stateRow = data as { active_battle_id?: string } | null;
  if (stateRow?.active_battle_id) return stateRow.active_battle_id;

  const battleId = randomId("battle");
  await supabase.from("idea_battles").upsert({ id: battleId, created_at: nowIso() });
  await supabase
    .from("app_state")
    .upsert({ id: 1, active_battle_id: battleId, updated_at: nowIso() });

  return battleId;
}

export async function setActiveBattle(ideaRows: Array<{ title: string; description: string; source?: "glm" | "user" }>) {
  const supabase = getSupabaseAdmin();
  const battleId = randomId("battle");

  await supabase.from("idea_battles").insert({ id: battleId, created_at: nowIso() });

  const rows = ideaRows.map((idea) => ({
    id: randomId("idea"),
    battle_id: battleId,
    title: idea.title,
    description: idea.description,
    source: idea.source ?? "glm",
    created_at: nowIso(),
  }));

  await supabase.from("ideas").insert(rows);
  await supabase
    .from("app_state")
    .upsert({ id: 1, active_battle_id: battleId, updated_at: nowIso() });

  return rows;
}

export async function getActiveIdeas(): Promise<Idea[]> {
  const supabase = getSupabaseAdmin();
  const battleId = await getOrCreateActiveBattleId();

  const { data, error } = await supabase
    .from("ideas")
    .select("id,battle_id,title,description,source,created_at")
    .eq("battle_id", battleId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as Idea[]) || [];
}

export async function getVoteMap(ideaIds: string[]): Promise<Record<string, VoteData>> {
  if (ideaIds.length === 0) return {};

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("votes")
    .select("idea_id,direction")
    .in("idea_id", ideaIds);

  if (error) throw error;

  const map: Record<string, VoteData> = Object.fromEntries(
    ideaIds.map((id) => [id, { up: 0, down: 0 }])
  );

  for (const row of data || []) {
    if (!map[row.idea_id]) map[row.idea_id] = { up: 0, down: 0 };
    if (row.direction === "up") map[row.idea_id].up += 1;
    if (row.direction === "down") map[row.idea_id].down += 1;
  }

  return map;
}

export async function castVote(params: {
  ideaId: string;
  direction: "up" | "down";
  voterKey: string;
}) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("votes").upsert(
    {
      id: randomId("vote"),
      idea_id: params.ideaId,
      voter_key: params.voterKey,
      direction: params.direction,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    { onConflict: "idea_id,voter_key" }
  );

  if (error) throw error;
}

export async function getBuildByIdeaId(ideaId: string): Promise<BuildRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("builds")
    .select("*")
    .eq("idea_id", ideaId)
    .maybeSingle();

  if (error) throw error;
  return (data as BuildRecord | null) ?? null;
}

export async function insertBuild(input: {
  ideaId: string;
  title: string;
  slug: string;
}): Promise<BuildRecord | null> {
  const supabase = getSupabaseAdmin();
  const row = {
    id: randomId("build"),
    idea_id: input.ideaId,
    title: input.title,
    slug: input.slug,
    reasoning: "",
    stream_text: "",
    landing_html: "",
    app_html: "",
    status: "building",
    error_message: null,
    started_at: nowIso(),
    updated_at: nowIso(),
    completed_at: null,
  };

  const { data, error } = await supabase
    .from("builds")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (error) {
    // 23505 unique violation means another builder already created it.
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }

  return (data as BuildRecord | null) ?? null;
}

export async function appendBuildStream(buildId: string, streamText: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("builds")
    .update({ stream_text: streamText, updated_at: nowIso() })
    .eq("id", buildId);

  if (error) throw error;
}

export async function completeBuild(params: {
  buildId: string;
  reasoning: string;
  landingHtml: string;
  appHtml: string;
  streamText: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("builds")
    .update({
      status: "completed",
      reasoning: params.reasoning,
      landing_html: params.landingHtml,
      app_html: params.appHtml,
      stream_text: params.streamText,
      updated_at: nowIso(),
      completed_at: nowIso(),
    })
    .eq("id", params.buildId);

  if (error) throw error;
}

export async function failBuild(buildId: string, errorMessage: string, streamText: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("builds")
    .update({
      status: "failed",
      error_message: errorMessage,
      stream_text: streamText,
      updated_at: nowIso(),
    })
    .eq("id", buildId);

  if (error) throw error;
}

export async function touchBuild(buildId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("builds")
    .update({ updated_at: nowIso() })
    .eq("id", buildId);
  if (error) throw error;
}

export async function restartBuild(params: {
  buildId: string;
  title: string;
  slug: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("builds")
    .update({
      title: params.title,
      slug: params.slug,
      status: "building",
      error_message: null,
      reasoning: "",
      stream_text: "",
      landing_html: "",
      app_html: "",
      started_at: nowIso(),
      updated_at: nowIso(),
      completed_at: null,
    })
    .eq("id", params.buildId);

  if (error) throw error;
}

export async function listBuildHistory(limit = 50): Promise<BuildRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("builds")
    .select("*")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as BuildRecord[]) || [];
}

/** Recent builds of any status (for dashboard: in progress vs finished). */
export async function listRecentBuilds(limit = 50): Promise<BuildRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("builds")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as BuildRecord[]) || [];
}

export async function getBuildBySlug(slug: string): Promise<BuildRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("builds")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data as BuildRecord | null) ?? null;
}
