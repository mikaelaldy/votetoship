"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Idea {
  id: string;
  title: string;
  description: string;
  source?: "glm" | "user";
}

interface VoteData {
  up: number;
  down: number;
}

interface Round {
  id: string;
  status: "OPEN_VOTING" | "BUILDING" | "SHOWCASE" | "ERROR";
  startsAt: number;
  endsAt: number;
  winnerSlug?: string;
}

interface RoundState {
  round: Round;
  ideas: Idea[];
  votes: Record<string, VoteData>;
  serverTime: number;
}

function getMyVotes(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("vts_myVotes");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveMyVotes(ids: Set<string>) {
  try {
    localStorage.setItem("vts_myVotes", JSON.stringify([...ids]));
  } catch {
    // no-op
  }
}

function ArenaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReset = searchParams.get("reset") === "1";

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, VoteData>>({});
  const [round, setRound] = useState<Round | null>(null);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [loadingIdeas, setLoadingIdeas] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [submissionTitle, setSubmissionTitle] = useState("");
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRoundState = useCallback(async () => {
    const res = await fetch("/api/round/current", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load round state");
    const data = (await res.json()) as RoundState;
    setIdeas(data.ideas || []);
    setVotes(data.votes || {});
    setRound(data.round);
    setTimeLeftMs(Math.max(0, data.round.endsAt - data.serverTime));
  }, []);

  useEffect(() => {
    setMyVotes(getMyVotes());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    (async () => {
      setLoadingIdeas(true);
      try {
        if (shouldReset) {
          await fetch("/api/ideas", { method: "POST" });
          saveMyVotes(new Set());
          setMyVotes(new Set());
        }
        await fetchRoundState();
      } catch {
        // no-op
      } finally {
        setLoadingIdeas(false);
      }
    })();
  }, [hydrated, shouldReset, fetchRoundState]);

  useEffect(() => {
    if (!round) return;

    if (round.status === "BUILDING") {
      router.push("/build");
      return;
    }

    if (round.status !== "OPEN_VOTING") return;

    const interval = setInterval(() => {
      setTimeLeftMs(Math.max(0, round.endsAt - Date.now()));
    }, 1000);

    return () => clearInterval(interval);
  }, [round, router]);

  useEffect(() => {
    if (!round) return;

    let cleanup: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
      const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

      if (!key || !cluster) {
        pollTimer = setInterval(() => {
          fetchRoundState().catch(() => undefined);
        }, 5000);
        return;
      }

      const mod = await import("pusher-js");
      const Pusher = mod.default;

      const pusher = new Pusher(key, {
        cluster,
      });

      const globalChannel = pusher.subscribe("arena-global");
      globalChannel.bind("round.started", () => {
        fetchRoundState().catch(() => undefined);
      });
      globalChannel.bind("round.completed", () => {
        fetchRoundState().catch(() => undefined);
      });

      const roundChannel = pusher.subscribe(`round-${round.id}`);
      roundChannel.bind("vote.updated", (event: { votes?: Record<string, VoteData> }) => {
        if (event?.votes) setVotes(event.votes);
      });
      roundChannel.bind("round.updated", (event: { round?: Round; serverTime?: number }) => {
        if (event?.round) {
          setRound(event.round);
          if (event.serverTime) {
            setTimeLeftMs(Math.max(0, event.round.endsAt - event.serverTime));
          }
          if (event.round.status === "BUILDING") {
            router.push("/build");
          }
        }
      });

      cleanup = () => {
        roundChannel.unbind_all();
        globalChannel.unbind_all();
        pusher.unsubscribe(`round-${round.id}`);
        pusher.unsubscribe("arena-global");
        pusher.disconnect();
      };
    })();

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (cleanup) cleanup();
    };
  }, [round, fetchRoundState, router]);

  const handleVote = useCallback(
    async (ideaId: string, direction: "up" | "down") => {
      if (!round || round.status !== "OPEN_VOTING") return;
      if (myVotes.has(ideaId)) return;

      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId, direction }),
        });

        if (!res.ok) return;

        const data = await res.json();
        setVotes(data.votes || {});
        const next = new Set(myVotes);
        next.add(ideaId);
        setMyVotes(next);
        saveMyVotes(next);
      } catch {
        // no-op
      }
    },
    [myVotes, round]
  );

  const handleReset = useCallback(async () => {
    try {
      await fetch("/api/ideas", { method: "POST" });
      setMyVotes(new Set());
      saveMyVotes(new Set());
      await fetchRoundState();
      router.replace("/arena");
    } catch {
      // no-op
    }
  }, [fetchRoundState, router]);

  const handleSubmitIdea = useCallback(async () => {
    setSubmissionMessage(null);
    setSubmissionError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/ideas/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: submissionTitle,
          description: submissionDescription,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmissionError(data.error || "Failed to submit idea");
        return;
      }

      setSubmissionMessage(data.message || "Submitted");
      setSubmissionTitle("");
      setSubmissionDescription("");
    } catch {
      setSubmissionError("Failed to submit idea");
    } finally {
      setSubmitting(false);
    }
  }, [submissionDescription, submissionTitle]);

  const getScore = useCallback(
    (ideaId: string) => {
      const v = votes[ideaId];
      return v ? v.up - v.down : 0;
    },
    [votes]
  );

  const totalVotes = useMemo(() => {
    return ideas.reduce((sum, idea) => {
      const v = votes[idea.id];
      return sum + (v ? v.up + v.down : 0);
    }, 0);
  }, [ideas, votes]);

  const sortedIdeas = useMemo(
    () => [...ideas].sort((a, b) => getScore(b.id) - getScore(a.id)),
    [ideas, getScore]
  );

  const maxScore =
    ideas.length > 0 ? Math.max(...ideas.map((i) => getScore(i.id)), 0) : 0;

  const timeText = useMemo(() => {
    const totalSeconds = Math.ceil(timeLeftMs / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [timeLeftMs]);

  if (!hydrated) return null;

  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1200px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link
            href="/"
            className="font-bold text-[18px]"
            style={{ color: "#1B1B1B" }}
          >
            VoteToShip
          </Link>
          <span className="text-[14px]" style={{ color: "#797979" }}>
            Powered by GLM 5.1
          </span>
        </div>
      </nav>

      <main className="max-w-[860px] mx-auto px-[24px] py-[40px]">
        <div className="mb-[20px]">
          <h1
            className="text-[44px] font-extrabold leading-tight"
            style={{ color: "#1B1B1B" }}
          >
            Battle Arena
          </h1>
          <p className="text-[18px] mt-[6px]" style={{ color: "#797979" }}>
            Scheduled rounds. Community votes decide what GLM builds.
          </p>

          <div className="flex items-center gap-[12px] mt-[10px] flex-wrap">
            <span className="text-[13px]" style={{ color: "#797979" }}>
              {myVotes.size}/{ideas.length} voted
            </span>
            <span style={{ color: "#C8CDD1" }}>.</span>
            <span className="text-[13px]" style={{ color: "#797979" }}>
              {totalVotes} total votes
            </span>
            <span style={{ color: "#C8CDD1" }}>.</span>
            <button
              onClick={handleReset}
              className="text-[13px] cursor-pointer underline"
              style={{ color: "#797979", background: "none", border: "none" }}
            >
              Start next round now
            </button>
          </div>
        </div>

        {round?.status === "OPEN_VOTING" && (
          <div
            className="text-center py-[14px] mb-[20px] rounded-[6px]"
            style={{ background: "#000001" }}
          >
            <p className="text-[16px] font-semibold" style={{ color: "#fff" }}>
              Voting closes in <span style={{ color: "#facc15" }}>{timeText}</span>
            </p>
          </div>
        )}

        {round?.status === "SHOWCASE" && round.winnerSlug && (
          <div
            className="text-center py-[14px] mb-[20px] rounded-[6px] border"
            style={{ borderColor: "#C8CDD1", background: "#fff" }}
          >
            <p className="text-[14px]" style={{ color: "#1B1B1B" }}>
              Last round finished. <Link href={`/app/${round.winnerSlug}`} className="underline">View winner</Link>
            </p>
          </div>
        )}

        {round?.status === "BUILDING" && (
          <div
            className="text-center py-[14px] mb-[20px] rounded-[6px]"
            style={{ background: "#000001" }}
          >
            <p className="text-[16px] font-semibold" style={{ color: "#fff" }}>
              Building winner now...
            </p>
          </div>
        )}

        {loadingIdeas && (
          <div className="space-y-[12px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[6px] border p-[24px]"
                style={{ borderColor: "#C8CDD1", background: "#fff" }}
              >
                <div className="h-[18px] w-[50%] rounded mb-[8px]" style={{ background: "#e5e5e5" }} />
                <div className="h-[14px] w-[80%] rounded" style={{ background: "#f0f0f0" }} />
              </div>
            ))}
          </div>
        )}

        {!loadingIdeas && sortedIdeas.length > 0 && (
          <div className="space-y-[12px]">
            {sortedIdeas.map((idea, index) => {
              const score = getScore(idea.id);
              const isLeader = score === maxScore && score > 0;
              const voted = myVotes.has(idea.id);
              return (
                <div
                  key={idea.id}
                  className="rounded-[6px] border p-[24px] flex items-start gap-[16px]"
                  style={{
                    borderColor: isLeader ? "#000001" : "#C8CDD1",
                    background: "#fff",
                    borderWidth: isLeader ? "2px" : "1px",
                    opacity: voted ? 0.72 : 1,
                  }}
                >
                  <div
                    className="text-[28px] font-extrabold shrink-0 w-[36px] text-right leading-none pt-[2px]"
                    style={{ color: isLeader ? "#000001" : "#C8CDD1" }}
                  >
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[8px] mb-[4px] flex-wrap">
                      <h3 className="text-[18px] font-semibold" style={{ color: "#1B1B1B" }}>
                        {idea.title}
                      </h3>
                      {idea.source === "user" && (
                        <span
                          className="text-[10px] font-bold px-[8px] py-[2px] rounded-full"
                          style={{ background: "#eef2ff", color: "#1e3a8a" }}
                        >
                          USER IDEA
                        </span>
                      )}
                      {isLeader && (
                        <span
                          className="text-[10px] font-bold px-[8px] py-[2px] rounded-full"
                          style={{ background: "#000001", color: "#fff" }}
                        >
                          WINNING
                        </span>
                      )}
                    </div>

                    <p className="text-[14px] mb-[12px] leading-relaxed" style={{ color: "#797979" }}>
                      {idea.description}
                    </p>

                    <div className="flex items-center gap-[8px]">
                      <button
                        onClick={() => handleVote(idea.id, "up")}
                        disabled={voted || round?.status !== "OPEN_VOTING"}
                        className="flex items-center gap-[4px] px-[14px] py-[6px] rounded-[22px] text-[13px] font-medium cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: "#C8CDD1",
                          background: "transparent",
                          color: "#1B1B1B",
                        }}
                      >
                        ▲ {votes[idea.id]?.up ?? 0}
                      </button>
                      <button
                        onClick={() => handleVote(idea.id, "down")}
                        disabled={voted || round?.status !== "OPEN_VOTING"}
                        className="flex items-center gap-[4px] px-[14px] py-[6px] rounded-[22px] text-[13px] font-medium cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: "#C8CDD1",
                          background: "transparent",
                          color: "#797979",
                        }}
                      >
                        ▼ {votes[idea.id]?.down ?? 0}
                      </button>

                      <span
                        className="text-[16px] font-bold ml-auto tabular-nums"
                        style={{
                          color:
                            score > 0 ? "#1B1B1B" : score < 0 ? "#c00" : "#797979",
                        }}
                      >
                        {score > 0 ? "+" : ""}
                        {score}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section
          className="mt-[28px] rounded-[6px] border p-[20px]"
          style={{ borderColor: "#C8CDD1", background: "#fff" }}
        >
          <h2 className="text-[20px] font-bold" style={{ color: "#1B1B1B" }}>
            Suggest an idea for future rounds
          </h2>
          <p className="text-[13px] mt-[4px] mb-[12px]" style={{ color: "#797979" }}>
            Submissions are queued and moderated before they can enter the arena.
          </p>

          <div className="grid grid-cols-1 gap-[10px]">
            <input
              value={submissionTitle}
              onChange={(e) => setSubmissionTitle(e.target.value)}
              placeholder="Title (2-60 chars)"
              className="px-[12px] py-[10px] rounded-[6px] border text-[14px]"
              style={{ borderColor: "#C8CDD1" }}
            />
            <textarea
              value={submissionDescription}
              onChange={(e) => setSubmissionDescription(e.target.value)}
              placeholder="Description (20-220 chars)"
              className="px-[12px] py-[10px] rounded-[6px] border text-[14px] min-h-[92px]"
              style={{ borderColor: "#C8CDD1" }}
            />
            <div className="flex items-center gap-[10px]">
              <button
                onClick={handleSubmitIdea}
                disabled={submitting}
                className="px-[16px] py-[9px] rounded-[22px] text-[14px] font-medium disabled:opacity-60"
                style={{ background: "#000001", color: "#fff" }}
              >
                {submitting ? "Submitting..." : "Submit Idea"}
              </button>
              {submissionMessage && (
                <span className="text-[13px]" style={{ color: "#166534" }}>
                  {submissionMessage}
                </span>
              )}
              {submissionError && (
                <span className="text-[13px]" style={{ color: "#b91c1c" }}>
                  {submissionError}
                </span>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-[20px]" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[800px] mx-auto px-[24px] text-center">
          <p className="text-[13px]" style={{ color: "#797979" }}>
            Built for the Build with GLM 5.1 Challenge · Powered by GLM 5.1 ·{" "}
            <a
              href="https://mikacend.xyz"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1B1B1B" }}
            >
              mikacend
            </a>
            {" · "}
            <Link href="/history" style={{ color: "#1B1B1B" }}>
              History
            </Link>
            {" · "}
            <Link href="/next" style={{ color: "#1B1B1B" }}>
              What&apos;s Next
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function ArenaPage() {
  return (
    <Suspense>
      <ArenaContent />
    </Suspense>
  );
}

