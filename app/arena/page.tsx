"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

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

function getVoterToken(): string {
  if (typeof window === "undefined") return "anon";
  const key = "vts_voter_token";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const token = `v_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  localStorage.setItem(key, token);
  return token;
}

function getVotedIdeas(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("vts_voted_ideas");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveVotedIdeas(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("vts_voted_ideas", JSON.stringify([...ids]));
}

function ArenaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReset = searchParams.get("reset") === "1";

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, VoteData>>({});
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<number | null>(null);

  const fetchAll = useCallback(async () => {
    const [ideasRes, votesRes] = await Promise.all([
      fetch("/api/ideas", { cache: "no-store" }),
      fetch("/api/vote", { cache: "no-store" }),
    ]);

    const ideasData = await ideasRes.json();
    const votesData = await votesRes.json();

    setIdeas(ideasData.ideas || []);
    setVotes(votesData.votes || {});
  }, []);

  useEffect(() => {
    setVoted(getVotedIdeas());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (shouldReset) {
          await fetch("/api/ideas", { method: "POST" });
          const empty = new Set<string>();
          setVoted(empty);
          saveVotedIdeas(empty);
          router.replace("/arena");
        }
        await fetchAll();
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchAll, shouldReset, router]);

  useEffect(() => {
    const poll = setInterval(() => {
      fetch("/api/vote", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setVotes(d.votes || {}))
        .catch(() => undefined);
    }, 2500);

    return () => clearInterval(poll);
  }, []);

  const scoreOf = useCallback(
    (id: string) => {
      const v = votes[id];
      return (v?.up || 0) - (v?.down || 0);
    },
    [votes]
  );

  const rankedIdeas = useMemo(
    () => [...ideas].sort((a, b) => scoreOf(b.id) - scoreOf(a.id)),
    [ideas, scoreOf]
  );

  const pendingIdeas = useMemo(
    () => rankedIdeas.filter((idea) => !voted.has(idea.id)),
    [rankedIdeas, voted]
  );

  const activeIdea = pendingIdeas[0] || null;

  const submitVote = useCallback(
    async (ideaId: string, direction: "up" | "down") => {
      const voterToken = getVoterToken();
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, direction, voterToken }),
      });

      if (!res.ok) return;

      const data = await res.json();
      setVotes(data.votes || {});
      const next = new Set(voted);
      next.add(ideaId);
      setVoted(next);
      saveVotedIdeas(next);
      setDragX(0);
    },
    [voted]
  );

  const handlePointerDown = (x: number) => {
    pointerStart.current = x;
  };

  const handlePointerMove = (x: number) => {
    if (pointerStart.current === null) return;
    setDragX(x - pointerStart.current);
  };

  const handlePointerUp = async () => {
    if (!activeIdea) return;
    if (dragX > 90) {
      await submitVote(activeIdea.id, "up");
      return;
    }
    if (dragX < -90) {
      await submitVote(activeIdea.id, "down");
      return;
    }
    setDragX(0);
    pointerStart.current = null;
  };

  const totalVotes = useMemo(() => {
    return ideas.reduce((sum, idea) => {
      const v = votes[idea.id];
      return sum + (v?.up || 0) + (v?.down || 0);
    }, 0);
  }, [ideas, votes]);

  if (loading) return null;

  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1100px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </Link>
          <button
            onClick={() => router.push("/arena?reset=1")}
            className="text-[13px] underline"
            style={{ color: "#797979", background: "none", border: "none" }}
          >
            Start clean battle
          </button>
        </div>
      </nav>

      <main className="max-w-[1100px] mx-auto px-[24px] py-[32px] grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-[24px]">
        <section>
          <h1 className="text-[38px] font-extrabold" style={{ color: "#1B1B1B" }}>
            Swipe to vote
          </h1>
          <p className="text-[16px] mt-[6px]" style={{ color: "#797979" }}>
            Swipe left for X, swipe right for Love. Build any idea anytime.
          </p>

          <div className="mt-[20px] flex items-center gap-[12px] text-[13px]" style={{ color: "#797979" }}>
            <span>{voted.size}/{ideas.length} voted</span>
            <span>.</span>
            <span>{totalVotes} total votes</span>
          </div>

          <div className="mt-[24px] min-h-[340px]">
            {activeIdea ? (
              <div
                onPointerDown={(e) => handlePointerDown(e.clientX)}
                onPointerMove={(e) => handlePointerMove(e.clientX)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="rounded-[10px] border p-[24px] select-none touch-pan-y cursor-grab"
                style={{
                  borderColor: "#C8CDD1",
                  background: "#fff",
                  transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
                  transition: pointerStart.current ? "none" : "transform 120ms ease",
                }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[24px] font-bold" style={{ color: "#1B1B1B" }}>
                    {activeIdea.title}
                  </h2>
                  <span className="text-[12px]" style={{ color: "#797979" }}>
                    {activeIdea.source === "user" ? "USER" : "AI"}
                  </span>
                </div>

                <p className="text-[15px] mt-[10px] leading-relaxed" style={{ color: "#797979" }}>
                  {activeIdea.description}
                </p>

                <div className="mt-[22px] grid grid-cols-3 gap-[10px]">
                  <button
                    onClick={() => submitVote(activeIdea.id, "down")}
                    className="px-[14px] py-[10px] rounded-[20px] border text-[14px] font-semibold"
                    style={{ borderColor: "#C8CDD1", color: "#b91c1c", background: "#fff" }}
                  >
                    X
                  </button>
                  <button
                    onClick={() => submitVote(activeIdea.id, "up")}
                    className="px-[14px] py-[10px] rounded-[20px] border text-[14px] font-semibold"
                    style={{ borderColor: "#C8CDD1", color: "#166534", background: "#fff" }}
                  >
                    Love
                  </button>
                  <button
                    onClick={() => router.push(`/build?ideaId=${activeIdea.id}`)}
                    className="px-[14px] py-[10px] rounded-[20px] text-[14px] font-semibold"
                    style={{ background: "#000001", color: "#fff" }}
                  >
                    Build
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[10px] border p-[24px]" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
                <p className="text-[16px]" style={{ color: "#1B1B1B" }}>
                  You voted all ideas. You can still build any idea from leaderboard.
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[22px] font-bold" style={{ color: "#1B1B1B" }}>
            Live leaderboard
          </h2>
          <div className="mt-[14px] space-y-[10px]">
            {rankedIdeas.map((idea, index) => {
              const v = votes[idea.id] || { up: 0, down: 0 };
              const score = v.up - v.down;
              return (
                <div key={idea.id} className="rounded-[8px] border p-[14px]" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
                  <div className="flex items-start gap-[10px]">
                    <span className="text-[20px] font-extrabold w-[24px] text-right" style={{ color: "#C8CDD1" }}>
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-[10px]">
                        <h3 className="text-[15px] font-semibold truncate" style={{ color: "#1B1B1B" }}>
                          {idea.title}
                        </h3>
                        <span className="text-[13px] font-semibold" style={{ color: score >= 0 ? "#1B1B1B" : "#b91c1c" }}>
                          {score >= 0 ? "+" : ""}
                          {score}
                        </span>
                      </div>
                      <p className="text-[13px] mt-[4px] line-clamp-2" style={{ color: "#797979" }}>
                        {idea.description}
                      </p>
                      <div className="mt-[8px] flex items-center justify-between">
                        <span className="text-[12px]" style={{ color: "#797979" }}>
                          Love {v.up} · X {v.down}
                        </span>
                        <button
                          onClick={() => router.push(`/build?ideaId=${idea.id}`)}
                          className="text-[12px] underline"
                          style={{ color: "#1B1B1B", background: "none", border: "none" }}
                        >
                          Build now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
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
