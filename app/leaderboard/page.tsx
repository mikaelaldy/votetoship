"use client";

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredAdminToken } from "@/lib/admin-client";
import { BUILD_UPVOTE_THRESHOLD } from "@/lib/constants";

interface Idea {
  id: string;
  title: string;
  description: string;
}

interface VoteData {
  up: number;
  down: number;
}

const IdeaRow = memo(function IdeaRow({
  idea,
  index,
  score,
  v,
  isAdmin,
  adminBusy,
  onBuild,
  onBoost,
  onDelete,
}: {
  idea: Idea;
  index: number;
  score: number;
  v: VoteData;
  isAdmin: boolean;
  adminBusy: boolean;
  onBuild: (ideaId: string, upvotes: number) => void;
  onBoost: (ideaId: string) => void;
  onDelete: (ideaId: string) => void;
}) {
  const unlocked = isAdmin || v.up >= BUILD_UPVOTE_THRESHOLD;

  return (
    <div className="panel p-5">
      <div className="flex items-start gap-4">
        <span className="w-8 shrink-0 text-right text-2xl font-extrabold tabular-nums text-[var(--color-border-default)]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="truncate text-base font-semibold text-[var(--color-text-primary)] sm:text-lg">
              {idea.title}
            </h3>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
              {score >= 0 ? "+" : ""}
              {score}
            </span>
          </div>
          <p className="pretty mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            {idea.description}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
            <span>Love {v.up} · X {v.down}</span>
            <span>
              {unlocked ? "Build unlocked" : `${BUILD_UPVOTE_THRESHOLD - v.up} more Love needed`}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => onBuild(idea.id, v.up)}
              disabled={!unlocked}
              className="pill-button pill-button-secondary"
            >
              Build now
            </button>
            {isAdmin ? (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onBoost(idea.id)}
                  disabled={adminBusy}
                  className="pill-button pill-button-secondary"
                >
                  +1 Love
                </button>
                <button
                  onClick={() => onDelete(idea.id)}
                  disabled={adminBusy}
                  className="pill-button pill-button-secondary"
                >
                  Remove idea
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

function LeaderboardContent() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, VoteData>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pollActiveRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ideasRes, votesRes] = await Promise.all([
        fetch("/api/ideas", { cache: "no-store" }),
        fetch("/api/vote", { cache: "no-store" }),
      ]);
      const ideasData = await ideasRes.json();
      const votesData = await votesRes.json();
      setIdeas(ideasData.ideas || []);
      setVotes(votesData.votes || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsAdmin(Boolean(getStoredAdminToken()));
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    pollActiveRef.current = true;
    const poll = setInterval(async () => {
      if (!pollActiveRef.current) return;
      try {
        const r = await fetch("/api/vote", { cache: "no-store" });
        const d = await r.json();
        setVotes(d.votes || {});
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      pollActiveRef.current = false;
      clearInterval(poll);
    };
  }, []);

  const rankedIdeas = useMemo(() => {
    return [...ideas].sort((a, b) => {
      const aVotes = votes[a.id] || { up: 0, down: 0 };
      const bVotes = votes[b.id] || { up: 0, down: 0 };
      return bVotes.up - bVotes.down - (aVotes.up - aVotes.down);
    });
  }, [ideas, votes]);

  const runAdminAction = async (body: Record<string, string>) => {
    setAdminBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getStoredAdminToken(),
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
      if (data.ideas) setIdeas(data.ideas || []);
      if (data.votes) setVotes(data.votes || {});
      if (body.action === "boostIdea") setNotice("Added one Love vote.");
      if (body.action === "deleteIdea") setNotice("Idea removed.");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleBuild = useCallback(
    (ideaId: string, upvotes: number) => {
      if (!isAdmin && upvotes < BUILD_UPVOTE_THRESHOLD) {
        setNotice(`This idea needs ${BUILD_UPVOTE_THRESHOLD} Love votes before it can be built.`);
        return;
      }
      router.push(`/build?ideaId=${ideaId}`);
    },
    [isAdmin, router]
  );

  if (loading) return null;

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="text-lg font-bold text-[var(--color-text-primary)]">
            VoteToShip
          </Link>
          <Link href="/arena" className="pill-button pill-button-secondary">
            Back to swipe voting
          </Link>
        </div>
      </nav>

      <main className="app-container page-section">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <p className="eyebrow">Leaderboard</p>
            <h1 className="balance mt-4 text-[40px] font-extrabold leading-none text-[var(--color-text-primary)] sm:text-[44px]">
              Live leaderboard
            </h1>
            <p className="pretty mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
              Top ideas ranked by Love minus X. Builds unlock at {BUILD_UPVOTE_THRESHOLD} Love votes.
            </p>

            {notice ? (
              <div className="panel mt-4 p-4 text-sm text-[var(--color-text-secondary)]">
                {notice}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              {rankedIdeas.map((idea, index) => {
                const v = votes[idea.id] || { up: 0, down: 0 };
                const score = v.up - v.down;
                return (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    index={index}
                    score={score}
                    v={v}
                    isAdmin={isAdmin}
                    adminBusy={adminBusy}
                    onBuild={handleBuild}
                    onBoost={(ideaId) => void runAdminAction({ action: "boostIdea", ideaId })}
                    onDelete={(ideaId) => void runAdminAction({ action: "deleteIdea", ideaId })}
                  />
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="panel p-5">
              <p className="eyebrow">Read the board</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                <li>Positive scores rise from Love outpacing X.</li>
                <li>Ideas need {BUILD_UPVOTE_THRESHOLD} Love votes before public builds unlock.</li>
                <li>Admin mode can boost ideas or remove weak ones for the demo.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense>
      <LeaderboardContent />
    </Suspense>
  );
}
