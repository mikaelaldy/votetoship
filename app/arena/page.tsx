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

const DRAG_LIMIT = 180;
const SWIPE_THRESHOLD = 96;

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
  const [isDragging, setIsDragging] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const votesRef = useRef<Record<string, VoteData>>({});
  const pollActiveRef = useRef(true);

  const fetchAll = useCallback(async () => {
    const [ideasRes, votesRes] = await Promise.all([
      fetch("/api/ideas", { cache: "no-store" }),
      fetch("/api/vote", { cache: "no-store" }),
    ]);

    const ideasData = await ideasRes.json();
    const votesData = await votesRes.json();

    const nextIdeas = shuffleIdeas(ideasData.ideas || []);
    setIdeas(nextIdeas);
    const freshVotes = votesData.votes || {};
    votesRef.current = freshVotes;
    setVotes(freshVotes);
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
    pollActiveRef.current = true;
    const poll = setInterval(async () => {
      if (!pollActiveRef.current) return;
      try {
        const r = await fetch("/api/vote", { cache: "no-store" });
        const d = await r.json();
        votesRef.current = d.votes || {};
        setVotes(votesRef.current);
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      pollActiveRef.current = false;
      clearInterval(poll);
    };
  }, []);

  const pendingIdeas = useMemo(
    () => ideas.filter((idea) => !voted.has(idea.id)),
    [ideas, voted]
  );

  const activeIdea = pendingIdeas[0] || null;

  const submitVote = useCallback(
    async (ideaId: string, direction: "up" | "down") => {
      if (refilling) return;
      const voterToken = getVoterToken();
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, direction, voterToken }),
      });

      if (!res.ok) return;

      const data = await res.json();
      const freshVotes = data.votes || {};
      votesRef.current = freshVotes;
      setVotes(freshVotes);
      setVoted((prev) => {
        const next = new Set(prev);
        next.add(ideaId);
        saveVotedIdeas(next);
        return next;
      });
      setDragX(0);
      setIsDragging(false);
    },
    [refilling]
  );

  const resetPointerState = () => {
    pointerStartX.current = null;
    pointerStartY.current = null;
    activePointerId.current = null;
    setDragX(0);
    setIsDragging(false);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (refilling) return;
    activePointerId.current = event.pointerId;
    pointerStartX.current = event.clientX;
    pointerStartY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      pointerStartX.current === null ||
      pointerStartY.current === null ||
      activePointerId.current !== event.pointerId
    ) {
      return;
    }

    const nextX = event.clientX - pointerStartX.current;
    const nextY = event.clientY - pointerStartY.current;
    if (Math.abs(nextY) > Math.abs(nextX) * 1.2) return;
    setDragX(Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, nextX)));
  };

  const handlePointerEnd = async (pointerId: number) => {
    if (activePointerId.current !== pointerId) return;
    if (refilling || !activeIdea) {
      resetPointerState();
      return;
    }

    if (dragX >= SWIPE_THRESHOLD) {
      await submitVote(activeIdea.id, "up");
      resetPointerState();
      return;
    }

    if (dragX <= -SWIPE_THRESHOLD) {
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

  const swipeProgress = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  useEffect(() => {
    if (loading || refilling) return;
    if (pendingIdeas.length > 2) return;

    (async () => {
      setRefilling(true);
      setIdeas([]);
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
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/arena" className="text-lg font-bold text-[var(--color-text-primary)]">
            VoteToShip
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/leaderboard" className="pill-button pill-button-secondary">
              Leaderboard
            </Link>
            <Link href="/history" className="pill-button pill-button-secondary">
              History
            </Link>
            <button
              onClick={() => router.push("/arena?reset=1")}
              className="pill-button pill-button-secondary"
            >
              Reset
            </button>
          </div>
        </div>
      </nav>

      <main className="app-container page-section">
        <section className="mx-auto max-w-[760px]">
            <p className="eyebrow">Arena</p>
            <h1 className="balance mt-4 text-[40px] font-extrabold leading-none text-[var(--color-text-primary)] sm:text-[44px]">
              Swipe to vote
            </h1>
            <p className="pretty mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
              Swipe left for X, swipe right for Love. Build any idea anytime.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <span className="panel px-4 py-2 shadow-none">{voted.size}/{ideas.length} voted</span>
              <span className="panel px-4 py-2 shadow-none">{totalVotes} total votes</span>
              {refilling ? <span className="panel px-4 py-2 shadow-none">Refreshing ideas...</span> : null}
            </div>

            <div className="mt-6 min-h-[360px]">
              {refilling ? (
                <div className="panel p-6">
                  <p className="text-base text-[var(--color-text-secondary)]">
                    Loading new ideas...
                  </p>
                </div>
              ) : activeIdea ? (
                <div className="relative">
                  <div
                    className="pointer-events-none absolute inset-x-0 top-4 z-10 flex items-center justify-between px-4"
                    aria-hidden
                  >
                    <span
                      className="rounded-[23px] border px-4 py-2 text-xs font-semibold uppercase"
                      style={{
                        opacity: dragX < 0 ? swipeProgress : 0.2,
                        borderColor: "#C8CDD1",
                        background: "#fff",
                        color: "#7f1d1d",
                      }}
                    >
                      X
                    </span>
                  </div>

                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={(event) => void handlePointerEnd(event.pointerId)}
                    onPointerCancel={() => resetPointerState()}
                    onLostPointerCapture={() => resetPointerState()}
                    className="panel relative select-none touch-pan-y p-6 sm:p-7"
                    style={{
                      transform: `translate3d(${dragX}px, 0, 0) rotate(${dragX / 20}deg)`,
                      transition: isDragging ? "none" : "transform 160ms ease-out",
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="balance text-[28px] font-bold leading-tight text-[var(--color-text-primary)]">
                        {activeIdea.title}
                      </h2>
                      <span className="rounded-[23px] border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                        {activeIdea.source === "user" ? "USER" : "AI"}
                      </span>
                    </div>

                    <p className="pretty mt-4 text-base leading-7 text-[var(--color-text-secondary)] sm:text-[17px]">
                      {activeIdea.description}
                    </p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <button
                        onClick={() => void submitVote(activeIdea.id, "down")}
                        className="pill-button pill-button-secondary w-full"
                      >
                        X
                      </button>
                      <button
                        onClick={() => void submitVote(activeIdea.id, "up")}
                        className="pill-button pill-button-secondary w-full"
                      >
                        Love
                      </button>
                      <button
                        onClick={() => router.push(`/build?ideaId=${activeIdea.id}`)}
                        className="pill-button pill-button-primary w-full"
                      >
                        Build
                      </button>
                    </div>

                    <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                      Drag at least {SWIPE_THRESHOLD}px to commit a swipe.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="panel p-6">
                  <p className="text-base text-[var(--color-text-primary)]">
                    You voted all ideas. You can still build any idea from the leaderboard.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/leaderboard" className="pill-button pill-button-secondary">
                      Open leaderboard
                    </Link>
                    <button
                      onClick={() => router.push("/arena?reset=1")}
                      className="pill-button pill-button-primary"
                    >
                      Start another round
                    </button>
                  </div>
                </div>
              )}
            </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border-default)]">
        <div className="app-container flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-[var(--color-text-secondary)]">
          <div className="flex flex-wrap items-center gap-4">
            <span>Swipe right for Love. Swipe left for X.</span>
            <a
              href="https://mikacend.xyz"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--color-text-primary)]"
            >
              mikacend.xyz
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/leaderboard" className="hover:text-[var(--color-text-primary)]">
              Live leaderboard
            </Link>
            <Link href="/history" className="hover:text-[var(--color-text-primary)]">
              Build history
            </Link>
          </div>
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
