"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Idea {
  id: string;
  title: string;
  description: string;
}

interface Votes {
  up: number;
  down: number;
}

interface BuildResult {
  winner: Idea;
  reasoning: string;
  html: string;
}

export default function ArenaPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, Votes>>({});
  const [builtHtml, setBuiltHtml] = useState<string | null>(null);
  const [winnerTitle, setWinnerTitle] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [loadingBuild, setLoadingBuild] = useState(false);
  const [copied, setCopied] = useState(false);
  const [buildReasoning, setBuildReasoning] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    const [ideasRes, votesRes] = await Promise.all([
      fetch("/api/ideas"),
      fetch("/api/vote"),
    ]);
    if (ideasRes.ok) {
      const data = await ideasRes.json();
      setIdeas(data.ideas);
    }
    if (votesRes.ok) {
      const data = await votesRes.json();
      setVotes(data.votes);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
    fetchExistingBuild();
    const interval = setInterval(async () => {
      const res = await fetch("/api/vote");
      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchIdeas]);

  const fetchExistingBuild = async () => {
    const res = await fetch("/api/build");
    if (res.ok) {
      const data = await res.json();
      if (data.html) {
        setBuiltHtml(data.html);
      }
    }
  };

  const handleGenerateIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const res = await fetch("/api/ideas", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas);
        setVotes({});
        setBuiltHtml(null);
        setWinnerTitle(null);
        setBuildReasoning(null);
      }
    } finally {
      setLoadingIdeas(false);
    }
  };

  const handleVote = async (ideaId: string, direction: "up" | "down") => {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaId, direction }),
    });
    if (res.ok) {
      const data = await res.json();
      setVotes((prev) => ({ ...prev, [ideaId]: data.votes }));
    }
  };

  const handleBuild = async () => {
    setLoadingBuild(true);
    try {
      const res = await fetch("/api/build", { method: "POST" });
      if (res.ok) {
        const data: BuildResult = await res.json();
        setBuiltHtml(data.html);
        setWinnerTitle(data.winner.title);
        setBuildReasoning(data.reasoning);
      } else {
        const data = await res.json();
        alert(data.error || "Build failed");
      }
    } catch {
      alert("Build failed — check your connection");
    } finally {
      setLoadingBuild(false);
    }
  };

  const handleCopy = async () => {
    if (!builtHtml) return;
    await navigator.clipboard.writeText(builtHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getScore = (ideaId: string) => {
    const v = votes[ideaId];
    return v ? v.up - v.down : 0;
  };

  const maxScore = Math.max(0, ...ideas.map((i) => getScore(i.id)));

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
          <span
            className="text-[14px]"
            style={{ color: "#797979" }}
          >
            Powered by GLM 5.1
          </span>
        </div>
      </nav>

      <main className="max-w-[1200px] mx-auto px-[24px] py-[40px]">
        <div className="flex items-center justify-between mb-[32px]">
          <div>
            <h1
              className="text-[44px] font-extrabold leading-tight text-balance"
              style={{ color: "#1B1B1B" }}
            >
              MVP Arena
            </h1>
            <p className="text-[18px] mt-[6px]" style={{ color: "#797979" }}>
              Vote on ideas. The winner gets built live.
            </p>
          </div>
          <div className="flex gap-[10px]">
            <button
              onClick={handleGenerateIdeas}
              disabled={loadingIdeas}
              className="px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: "#C8CDD1",
                color: "#1B1B1B",
                background: "transparent",
              }}
            >
              {loadingIdeas ? "Generating..." : "New Ideas"}
            </button>
            <button
              onClick={handleBuild}
              disabled={loadingBuild || ideas.length === 0}
              className="px-[24px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "#000001",
                color: "#fff",
              }}
            >
              {loadingBuild ? "Building..." : "Build Winner"}
            </button>
          </div>
        </div>

        {ideas.length === 0 && !loadingIdeas && (
          <div
            className="text-center py-[92px] rounded-[6px] border"
            style={{
              borderColor: "#C8CDD1",
              color: "#797979",
            }}
          >
            <p className="text-[20px] mb-[16px]">No ideas yet</p>
            <button
              onClick={handleGenerateIdeas}
              className="px-[24px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer"
              style={{ background: "#000001", color: "#fff" }}
            >
              Generate Ideas
            </button>
          </div>
        )}

        {loadingIdeas && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[6px] border p-[24px]"
                style={{
                  borderColor: "#C8CDD1",
                  background: "#fff",
                }}
              >
                <div
                  className="h-[20px] w-[60%] rounded mb-[10px]"
                  style={{ background: "#e5e5e5" }}
                />
                <div
                  className="h-[14px] w-full rounded mb-[6px]"
                  style={{ background: "#f0f0f0" }}
                />
                <div
                  className="h-[14px] w-[80%] rounded"
                  style={{ background: "#f0f0f0" }}
                />
              </div>
            ))}
          </div>
        )}

        {!loadingIdeas && ideas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px] mb-[40px]">
            {ideas.map((idea) => {
              const score = getScore(idea.id);
              const isLeader = score === maxScore && score > 0;
              return (
                <div
                  key={idea.id}
                  className="rounded-[6px] border p-[24px] relative"
                  style={{
                    borderColor: isLeader ? "#000001" : "#C8CDD1",
                    background: "#fff",
                    borderWidth: isLeader ? "2px" : "1px",
                  }}
                >
                  {isLeader && (
                    <span
                      className="absolute top-[10px] right-[10px] text-[10px] font-bold px-[8px] py-[2px] rounded-full"
                      style={{ background: "#000001", color: "#fff" }}
                    >
                      LEADING
                    </span>
                  )}
                  <h3
                    className="text-[20px] font-semibold mb-[6px] pr-[54px]"
                    style={{ color: "#1B1B1B" }}
                  >
                    {idea.title}
                  </h3>
                  <p
                    className="text-[14px] mb-[16px] leading-relaxed"
                    style={{ color: "#797979" }}
                  >
                    {idea.description}
                  </p>
                  <div className="flex items-center gap-[10px]">
                    <button
                      onClick={() => handleVote(idea.id, "up")}
                      className="flex items-center gap-[4px] px-[12px] py-[6px] rounded-[22px] text-[13px] font-medium cursor-pointer border"
                      style={{
                        borderColor: "#C8CDD1",
                        background: "transparent",
                        color: "#1B1B1B",
                      }}
                      aria-label={`Upvote ${idea.title}`}
                    >
                      ▲ {(votes[idea.id]?.up ?? 0)}
                    </button>
                    <button
                      onClick={() => handleVote(idea.id, "down")}
                      className="flex items-center gap-[4px] px-[12px] py-[6px] rounded-[22px] text-[13px] font-medium cursor-pointer border"
                      style={{
                        borderColor: "#C8CDD1",
                        background: "transparent",
                        color: "#797979",
                      }}
                      aria-label={`Downvote ${idea.title}`}
                    >
                      ▼ {(votes[idea.id]?.down ?? 0)}
                    </button>
                    <span
                      className="text-[14px] font-bold ml-auto tabular-nums"
                      style={{
                        color: score > 0 ? "#1B1B1B" : score < 0 ? "#c00" : "#797979",
                      }}
                    >
                      {score > 0 ? "+" : ""}
                      {score}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loadingBuild && (
          <div
            className="rounded-[6px] border p-[54px] text-center"
            style={{ borderColor: "#C8CDD1", background: "#fff" }}
          >
            <div className="text-[20px] font-medium mb-[10px]" style={{ color: "#1B1B1B" }}>
              GLM 5.1 is building...
            </div>
            <p className="text-[14px]" style={{ color: "#797979" }}>
              Analyzing votes, picking the winner, and generating the app.
              This may take 30-60 seconds.
            </p>
          </div>
        )}

        {builtHtml && !loadingBuild && (
          <div className="mt-[10px]">
            <div className="flex items-center justify-between mb-[10px]">
              <div>
                <h2
                  className="text-[24px] font-bold"
                  style={{ color: "#1B1B1B" }}
                >
                  {winnerTitle
                    ? `Built: ${winnerTitle}`
                    : "Live Preview"}
                </h2>
                {buildReasoning && (
                  <p className="text-[14px] mt-[4px]" style={{ color: "#797979" }}>
                    {buildReasoning}
                  </p>
                )}
              </div>
              <button
                onClick={handleCopy}
                className="px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer border"
                style={{
                  borderColor: "#C8CDD1",
                  background: copied ? "#000001" : "transparent",
                  color: copied ? "#fff" : "#1B1B1B",
                }}
              >
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <div
              className="rounded-[6px] border overflow-hidden"
              style={{
                borderColor: "#C8CDD1",
                background: "#fff",
              }}
            >
              <iframe
                srcDoc={builtHtml}
                sandbox="allow-scripts"
                className="w-full border-none"
                style={{ height: "600px" }}
                title="Built App Preview"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
