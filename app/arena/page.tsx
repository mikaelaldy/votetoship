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

function shuffleIdeas(items: Idea[]): Idea[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
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
  const [refilling, setRefilling] = useState(false);
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);

  const fetchAll = useCallback(async () => {
    const [ideasRes, votesRes] = await Promise.all([
      fetch("/api/ideas", { cache: "no-store" }),
      fetch("/api/vote", { cache: "no-store" }),
    ]);

    const ideasData = await ideasRes.json();
    const votesData = await votesRes.json();

    const nextIdeas = shuffleIdeas(ideasData.ideas || []);
    setIdeas(nextIdeas);
    setVotes(votesData.votes || {});
    const currentIds = new Set(nextIdeas.map((idea: Idea) => idea.id));
    setVoted((prev) => {
      const filtered = new Set([...prev].filter((id) => currentIds.has(id)));
      saveVotedIdeas(filtered);
      return filtered;
    });
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

  const pendingIdeas = useMemo(
    () => ideas.filter((idea) => !voted.has(idea.id)),
    [ideas, voted]
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

  const handlePointerDown = (pointerId: number, x: number, target: HTMLElement) => {
    activePointerId.current = pointerId;
    pointerStart.current = x;
    target.setPointerCapture(pointerId);
  };

  const handlePointerMove = (pointerId: number, x: number) => {
    if (pointerStart.current === null || activePointerId.current !== pointerId) return;
    // Keep swipe movement bounded so card stays controllable on long drags.
    setDragX(Math.max(-180, Math.min(180, x - pointerStart.current)));
  };

  const resetPointerState = () => {
    pointerStart.current = null;
    activePointerId.current = null;
    setDragX(0);
  };

  const handlePointerUp = async (pointerId: number) => {
    if (activePointerId.current !== pointerId) return;
    if (!activeIdea) {
      resetPointerState();
      return;
    }

    if (dragX > 90) {
      await submitVote(activeIdea.id, "up");
      resetPointerState();
      return;
    }
    if (dragX < -90) {
      await submitVote(activeIdea.id, "down");
      resetPointerState();
      return;
    }

    resetPointerState();
  };

  const totalVotes = useMemo(() => {
    return ideas.reduce((sum, idea) => {
      const v = votes[idea.id];
      return sum + (v?.up || 0) + (v?.down || 0);
    }, 0);
  }, [ideas, votes]);

  useEffect(() => {
    if (loading || refilling) return;
    // Keep swipe flow almost infinite by refilling before user hits empty state.
    if (pendingIdeas.length > 2) return;

    (async () => {
      setRefilling(true);
      try {
        await fetch("/api/ideas", { method: "POST" });
        const empty = new Set<string>();
        setVoted(empty);
        saveVotedIdeas(empty);
        await fetchAll();
      } finally {
        setRefilling(false);
      }
    })();
  }, [fetchAll, loading, pendingIdeas.length, refilling]);

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

      <main className="max-w-[1100px] mx-auto px-[24px] py-[32px]">
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
            {refilling ? (
              <>
                <span>.</span>
                <span>Refreshing ideas...</span>
              </>
            ) : null}
          </div>

          <div className="mt-[24px] min-h-[340px] max-w-[700px]">
            {activeIdea ? (
              <div
                onPointerDown={(e) => handlePointerDown(e.pointerId, e.clientX, e.currentTarget)}
                onPointerMove={(e) => handlePointerMove(e.pointerId, e.clientX)}
                onPointerUp={(e) => handlePointerUp(e.pointerId)}
                onPointerCancel={() => resetPointerState()}
                onPointerLeave={() => {
                  if (pointerStart.current !== null) resetPointerState();
                }}
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

          <div className="mt-[14px]">
            <Link href="/leaderboard" className="text-[14px] underline" style={{ color: "#1B1B1B" }}>
              Open live leaderboard
            </Link>
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
