"use client";

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  onBuild,
}: {
  idea: Idea;
  index: number;
  score: number;
  v: VoteData;
  onBuild: (ideaId: string) => void;
}) {
  return (
    <div className="rounded-[8px] border p-[14px]" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
      <div className="flex items-start gap-[10px]">
        <span className="text-[20px] font-extrabold w-[24px] text-right" style={{ color: "#C8CDD1" }}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-[10px]">
            <h3 className="text-[15px] font-semibold truncate" style={{ color: "#1B1B1B" }}>
              {idea.title}
            </h3>
            <span className="text-[13px] font-semibold shrink-0" style={{ color: score >= 0 ? "#1B1B1B" : "#b91c1c" }}>
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
              onClick={() => onBuild(idea.id)}
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
});

function LeaderboardContent() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, VoteData>>({});
  const [loading, setLoading] = useState(true);
  const pollActiveRef = useRef(true);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

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

  const handleBuild = useCallback(
    (ideaId: string) => {
      router.push(`/build?ideaId=${ideaId}`);
    },
    [router]
  );

  if (loading) return null;

  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1100px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </Link>
          <Link href="/arena" className="text-[13px] underline" style={{ color: "#797979" }}>
            Back to swipe voting
          </Link>
        </div>
      </nav>

      <main className="max-w-[1100px] mx-auto px-[24px] py-[32px]">
        <h1 className="text-[38px] font-extrabold" style={{ color: "#1B1B1B" }}>
          Live leaderboard
        </h1>
        <p className="text-[16px] mt-[6px]" style={{ color: "#797979" }}>
          Top ideas ranked by Love minus X.
        </p>

        <div className="mt-[18px] space-y-[10px] max-w-[780px]">
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
                onBuild={handleBuild}
              />
            );
          })}
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
