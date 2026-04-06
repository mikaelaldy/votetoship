import { callGLM, extractJSON } from "@/lib/glm";
import { buildIdeasPrompt } from "@/lib/prompts";
import {
  acquireLock,
  deleteVotesForRound,
  generateRoundId,
  getActiveRound,
  getAllVotes,
  getApprovedSubmissions,
  getIdeas,
  getPendingSubmissions,
  getRoundDurationsMs,
  Idea,
  RoundRecord,
  setActiveRound,
  setIdeas,
  updateSubmissionStatus,
} from "@/lib/kv";
import { publishGlobalEvent, publishRoundEvent } from "@/lib/realtime";

interface RawIdea {
  title: string;
  description: string;
}

interface ModerationDecision {
  id: string;
  status: "APPROVED" | "REJECTED";
  reason?: string;
}

function generateIdeaId(): string {
  return `idea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackIdeas(count: number): RawIdea[] {
  const seed: RawIdea[] = [
    {
      title: "Neon Habit Sprint",
      description:
        "A timer-based habit tracker that turns streak progress into an animated race.",
    },
    {
      title: "Pixel Garden",
      description:
        "Plant and grow a tiny reactive pixel garden based on your mood input.",
    },
    {
      title: "Beat Sketch",
      description:
        "Draw on a canvas that reacts with color bursts and pulses to generated rhythms.",
    },
    {
      title: "Decision Duel",
      description:
        "Compare two choices in a playful mini-simulation and watch outcomes animate.",
    },
    {
      title: "Focus Orbit",
      description:
        "A focus timer where completed sessions unlock orbiting visual trophies.",
    },
  ];
  return seed.slice(0, count);
}

async function generateGLMIdeas(count: number): Promise<RawIdea[]> {
  try {
    const raw = await callGLM(buildIdeasPrompt(), 0.9);
    const parsed = extractJSON<RawIdea[]>(raw);
    return parsed.slice(0, count);
  } catch {
    return fallbackIdeas(count);
  }
}

async function moderatePendingSubmissions() {
  const pending = await getPendingSubmissions();
  if (pending.length === 0) return;

  const listing = pending
    .map(
      (s) =>
        `ID: ${s.id}\nTitle: ${s.title}\nDescription: ${s.description}`
    )
    .join("\n\n");

  const messages = [
    {
      role: "system" as const,
      content:
        "You moderate user-submitted web app ideas for a public arena. Approve only ideas that are safe, non-abusive, feasible as a single-page HTML app with Tailwind and vanilla JS, and interesting for a short community vote.",
    },
    {
      role: "user" as const,
      content: `Moderate these submissions:\n\n${listing}\n\nReturn a JSON array where each item is:\n{ "id": string, "status": "APPROVED" | "REJECTED", "reason": "short reason" }\nReturn ONLY JSON.`,
    },
  ];

  try {
    const raw = await callGLM(messages, 0.2);
    const decisions = extractJSON<ModerationDecision[]>(raw);
    for (const decision of decisions) {
      if (decision.status === "APPROVED") {
        await updateSubmissionStatus(decision.id, "APPROVED", decision.reason);
      } else {
        await updateSubmissionStatus(decision.id, "REJECTED", decision.reason);
      }
    }
  } catch {
    // Keep pending items for future retry.
  }
}

async function buildRoundIdeas(roundId: string): Promise<Idea[]> {
  await moderatePendingSubmissions();

  const approved = await getApprovedSubmissions(2);
  const ideas: Idea[] = approved.slice(0, 2).map((submission) => ({
    id: generateIdeaId(),
    title: submission.title,
    description: submission.description,
    source: "user",
    roundId,
  }));

  const needed = Math.max(0, 5 - ideas.length);
  const glmIdeas = await generateGLMIdeas(needed);

  for (const g of glmIdeas) {
    ideas.push({
      id: generateIdeaId(),
      title: g.title,
      description: g.description,
      source: "glm",
      roundId,
    });
  }

  return ideas.slice(0, 5);
}

export async function createNewRound(): Promise<RoundRecord> {
  const { votingMs } = getRoundDurationsMs();
  const now = Date.now();
  const roundId = generateRoundId();

  const previousRound = await getActiveRound();
  const previousIdeas = await getIdeas();

  const ideas = await buildRoundIdeas(roundId);
  await setIdeas(ideas);

  const nextRound: RoundRecord = {
    id: roundId,
    status: "OPEN_VOTING",
    startsAt: now,
    endsAt: now + votingMs,
  };

  await setActiveRound(nextRound);

  if (previousRound) {
    await deleteVotesForRound(previousRound.id, previousIdeas);
  }

  const votes = await getAllVotes(ideas, roundId);
  await publishGlobalEvent("round.started", {
    round: nextRound,
    ideas,
    votes,
    serverTime: now,
  });
  await publishRoundEvent(roundId, "round.updated", {
    round: nextRound,
    serverTime: now,
  });

  return nextRound;
}

export async function ensureRoundInitialized(): Promise<RoundRecord> {
  const current = await getActiveRound();
  if (current) return current;
  return createNewRound();
}

export async function getCurrentRoundState() {
  const round = await ensureRoundInitialized();
  const ideas = await getIdeas();
  const votes = await getAllVotes(ideas, round.id);
  return {
    round,
    ideas,
    votes,
    serverTime: Date.now(),
  };
}

export async function tickRoundTransitions() {
  const gotLock = await acquireLock("round-tick", 50);
  if (!gotLock) {
    return getCurrentRoundState();
  }

  const { showcaseMs } = getRoundDurationsMs();
  const current = await ensureRoundInitialized();
  const now = Date.now();

  if (current.status === "OPEN_VOTING" && now >= current.endsAt) {
    const updated: RoundRecord = {
      ...current,
      status: "BUILDING",
      buildStartedAt: now,
      buildError: undefined,
    };
    await setActiveRound(updated);
    await publishRoundEvent(updated.id, "round.updated", {
      round: updated,
      serverTime: now,
    });
    return {
      round: updated,
      ideas: await getIdeas(),
      votes: await getAllVotes(await getIdeas(), updated.id),
      serverTime: now,
    };
  }

  if (
    current.status === "SHOWCASE" &&
    current.buildCompletedAt &&
    now >= current.buildCompletedAt + showcaseMs
  ) {
    const round = await createNewRound();
    const ideas = await getIdeas();
    const votes = await getAllVotes(ideas, round.id);
    return {
      round,
      ideas,
      votes,
      serverTime: now,
    };
  }

  return {
    round: current,
    ideas: await getIdeas(),
    votes: await getAllVotes(await getIdeas(), current.id),
    serverTime: now,
  };
}
