"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredAdminToken } from "@/lib/admin-client";
import { BUILD_UPVOTE_THRESHOLD } from "@/lib/constants";

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

interface VoteFeedback {
  ideaTitle: string;
  direction: "up" | "down";
}

const DRAG_LIMIT = 180;
const SWIPE_THRESHOLD = 96;
const SWIPE_EXIT_DISTANCE = 520;

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

function clearVotedIdeas() {
  const empty = new Set<string>();
  saveVotedIdeas(empty);
  return empty;
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
  const [swipeExit, setSwipeExit] = useState<"left" | "right" | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [voteFeedback, setVoteFeedback] = useState<VoteFeedback | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const votesRef = useRef<Record<string, VoteData>>({});
  const pollActiveRef = useRef(true);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adminHeaders = useCallback((): Record<string, string> => {
    const token = getStoredAdminToken();
    return token ? { "x-admin-token": token } : {};
  }, []);

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
    setIsAdmin(Boolean(getStoredAdminToken()));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (shouldReset) {
          await fetch("/api/ideas", { method: "POST" });
          setVoted(clearVotedIdeas());
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
    async (ideaId: string, title: string, direction: "up" | "down") => {
      if (refilling) return;
      setSwipeExit(direction === "up" ? "right" : "left");
      await new Promise((resolve) => setTimeout(resolve, 180));

      const voterToken = getVoterToken();
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, direction, voterToken }),
      });

      if (!res.ok) {
        setNotice("Could not save your vote. Try again.");
        setSwipeExit(null);
        setDragX(0);
        setIsDragging(false);
        return;
      }

      const data = await res.json();
      const freshVotes = data.votes || {};
      votesRef.current = freshVotes;
      setVotes(freshVotes);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      setVoteFeedback({ ideaTitle: title, direction });
      feedbackTimeoutRef.current = setTimeout(() => {
        setVoteFeedback(null);
      }, 1100);
      setVoted((prev) => {
        const next = new Set(prev);
        next.add(ideaId);
        saveVotedIdeas(next);
        return next;
      });
      setSwipeExit(null);
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
    setSwipeExit(null);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

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
      await submitVote(activeIdea.id, activeIdea.title, "up");
      resetPointerState();
      return;
    }

    if (dragX <= -SWIPE_THRESHOLD) {
      await submitVote(activeIdea.id, activeIdea.title, "down");
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
  const activeUpvotes = activeIdea ? votes[activeIdea.id]?.up || 0 : 0;
  const canBuildActiveIdea = isAdmin || activeUpvotes >= BUILD_UPVOTE_THRESHOLD;
  const animatedDragX =
    swipeExit === "left"
      ? -SWIPE_EXIT_DISTANCE
      : swipeExit === "right"
        ? SWIPE_EXIT_DISTANCE
        : dragX;

  useEffect(() => {
    if (loading || refilling) return;
    if (pendingIdeas.length > 2) return;

    (async () => {
      setRefilling(true);
      setIdeas([]);
      try {
        await fetch("/api/ideas", { method: "POST" });
        setVoted(clearVotedIdeas());
        await fetchAll();
      } finally {
        setRefilling(false);
      }
    })();
  }, [fetchAll, loading, pendingIdeas.length, refilling]);

  const runAdminAction = async (body: Record<string, string>) => {
    setAdminBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...adminHeaders(),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Admin action failed.");
        return;
      }

      if (body.action === "boostIdea" && body.ideaId) {
        setVotes((prev) => {
          const current = prev[body.ideaId] || { up: 0, down: 0 };
          return {
            ...prev,
            [body.ideaId]: {
              up: current.up + 1,
              down: current.down,
            },
          };
        });
      }

      if (data.ideas) setIdeas(shuffleIdeas(data.ideas || []));
      if (data.votes) {
        votesRef.current = data.votes || {};
        setVotes(votesRef.current);
      }

      if (body.action === "resetDemo") {
        setVoted(clearVotedIdeas());
        setNotice("Demo data reset. Fresh ideas loaded.");
      }
      if (body.action === "boostIdea") setNotice("Added one Love vote.");
      if (body.action === "deleteIdea") setNotice("Idea removed.");
    } finally {
      setAdminBusy(false);
    }
  };

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
            {isAdmin ? (
              <button
                onClick={() => void runAdminAction({ action: "resetDemo" })}
                disabled={adminBusy}
                className="pill-button pill-button-secondary"
              >
                Start over
              </button>
            ) : (
              <button
                onClick={() => router.push("/arena?reset=1")}
                className="pill-button pill-button-secondary"
              >
                Reset
              </button>
            )}
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
            Swipe left for X, swipe right for Love. Builds unlock at {BUILD_UPVOTE_THRESHOLD} Love votes.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
            <span className="panel px-4 py-2 shadow-none">{voted.size}/{ideas.length} voted</span>
            <span className="panel px-4 py-2 shadow-none">{totalVotes} total votes</span>
            {refilling ? <span className="panel px-4 py-2 shadow-none">Refreshing ideas...</span> : null}
            {isAdmin ? <span className="panel px-4 py-2 shadow-none">Admin mode active</span> : null}
          </div>

          {notice ? (
            <div className="panel mt-4 p-4 text-sm text-[var(--color-text-secondary)]">
              {notice}
            </div>
          ) : null}

          {voteFeedback ? (
            <div
              className={`arena-vote-feedback mt-4 ${
                voteFeedback.direction === "up"
                  ? "arena-vote-feedback-up"
                  : "arena-vote-feedback-down"
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                {voteFeedback.direction === "up" ? "Loved" : "Passed"}
              </span>
              <span className="text-sm text-[var(--color-text-secondary)] sm:text-base">
                {voteFeedback.ideaTitle}
              </span>
            </div>
          ) : null}

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
                  <span
                    className="rounded-[23px] border px-4 py-2 text-xs font-semibold uppercase"
                    style={{
                      opacity: dragX > 0 ? swipeProgress : 0.2,
                      borderColor: "#b7d7bf",
                      background: "#f3fbf5",
                      color: "#166534",
                    }}
                  >
                    Love
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
                    transform: `translate3d(${animatedDragX}px, 0, 0) rotate(${animatedDragX / 20}deg) scale(${swipeExit ? 0.98 : 1})`,
                    opacity: swipeExit ? 0 : 1,
                    transition:
                      isDragging && !swipeExit
                        ? "none"
                        : "transform 180ms ease-out, opacity 180ms ease-out",
                  }}
                >
                  {swipeExit ? (
                    <div
                      className={`arena-vote-stamp ${
                        swipeExit === "right" ? "arena-vote-stamp-up" : "arena-vote-stamp-down"
                      }`}
                    >
                      {swipeExit === "right" ? "Loved" : "Passed"}
                    </div>
                  ) : null}

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

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                    <span className="panel px-4 py-2 shadow-none">
                      Love {activeUpvotes} / {BUILD_UPVOTE_THRESHOLD}
                    </span>
                    {!canBuildActiveIdea ? (
                      <span className="panel px-4 py-2 shadow-none">
                        Needs {BUILD_UPVOTE_THRESHOLD - activeUpvotes} more Love to unlock build
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <button
                      onClick={() => void submitVote(activeIdea.id, activeIdea.title, "down")}
                      className="pill-button pill-button-secondary w-full"
                    >
                      X
                    </button>
                    <button
                      onClick={() => void submitVote(activeIdea.id, activeIdea.title, "up")}
                      className="pill-button pill-button-secondary w-full"
                    >
                      Love
                    </button>
                    <button
                      onClick={() => {
                        if (!canBuildActiveIdea) {
                          setNotice(`This idea needs ${BUILD_UPVOTE_THRESHOLD} Love votes before it can be built.`);
                          return;
                        }
                        router.push(`/build?ideaId=${activeIdea.id}`);
                      }}
                      disabled={!canBuildActiveIdea}
                      className="pill-button pill-button-primary w-full"
                    >
                      Build
                    </button>
                  </div>

                  {isAdmin ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => void runAdminAction({ action: "boostIdea", ideaId: activeIdea.id })}
                        disabled={adminBusy}
                        className="pill-button pill-button-secondary"
                      >
                        +1 Love
                      </button>
                      <button
                        onClick={() => void runAdminAction({ action: "deleteIdea", ideaId: activeIdea.id })}
                        disabled={adminBusy}
                        className="pill-button pill-button-secondary"
                      >
                        Remove idea
                      </button>
                    </div>
                  ) : null}

                  <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                    Drag at least {SWIPE_THRESHOLD}px to commit a swipe.
                  </p>
                </div>
              </div>
            ) : (
              <div className="panel p-6">
                <p className="text-base text-[var(--color-text-primary)]">
                  You voted all ideas. You can still build unlocked ideas from the leaderboard.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/leaderboard" className="pill-button pill-button-secondary">
                    Open leaderboard
                  </Link>
                  <button
                    onClick={() => (isAdmin ? void runAdminAction({ action: "resetDemo" }) : router.push("/arena?reset=1"))}
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
              made by mikacend
            </a>
            <a
              href="https://twitter.com/mikaelbuilds"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--color-text-primary)]"
            >
              @mikaelbuilds
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
