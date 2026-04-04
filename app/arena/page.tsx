"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

type BuildPhase = "idle" | "analyzing" | "generating" | "done";

const STORAGE_KEYS = {
  ideas: "vts_ideas",
  votes: "vts_votes",
  builtHtml: "vts_builtHtml",
  winnerTitle: "vts_winnerTitle",
  buildReasoning: "vts_buildReasoning",
} as const;

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ArenaPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, Votes>>({});
  const [builtHtml, setBuiltHtml] = useState<string | null>(null);
  const [winnerTitle, setWinnerTitle] = useState<string | null>(null);
  const [buildReasoning, setBuildReasoning] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [buildPhase, setBuildPhase] = useState<BuildPhase>("idle");
  const [buildElapsed, setBuildElapsed] = useState(0);
  const [liveCode, setLiveCode] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const codeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdeas(loadJSON(STORAGE_KEYS.ideas, []));
    setVotes(loadJSON<Record<string, Votes>>(STORAGE_KEYS.votes, {}));
    setBuiltHtml(loadJSON<string | null>(STORAGE_KEYS.builtHtml, null));
    setWinnerTitle(loadJSON<string | null>(STORAGE_KEYS.winnerTitle, null));
    setBuildReasoning(
      loadJSON<string | null>(STORAGE_KEYS.buildReasoning, null)
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.ideas, ideas);
  }, [ideas, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.votes, votes);
  }, [votes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (builtHtml) saveJSON(STORAGE_KEYS.builtHtml, builtHtml);
    else localStorage.removeItem(STORAGE_KEYS.builtHtml);
  }, [builtHtml, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (winnerTitle) saveJSON(STORAGE_KEYS.winnerTitle, winnerTitle);
    else localStorage.removeItem(STORAGE_KEYS.winnerTitle);
  }, [winnerTitle, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (buildReasoning) saveJSON(STORAGE_KEYS.buildReasoning, buildReasoning);
    else localStorage.removeItem(STORAGE_KEYS.buildReasoning);
  }, [buildReasoning, hydrated]);

  useEffect(() => {
    codeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveCode]);

  useEffect(() => {
    if (buildPhase !== "analyzing" && buildPhase !== "generating") return;
    const interval = setInterval(() => {
      setBuildElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [buildPhase]);

  const handleGenerateIdeas = useCallback(async () => {
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
        setBuildPhase("idle");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to generate ideas");
      }
    } catch {
      alert("Failed to generate ideas — check your connection");
    } finally {
      setLoadingIdeas(false);
    }
  }, []);

  const handleVote = useCallback(
    (ideaId: string, direction: "up" | "down") => {
      setVotes((prev) => {
        const current = prev[ideaId] ?? { up: 0, down: 0 };
        const updated =
          direction === "up"
            ? { up: current.up + 1, down: current.down }
            : { up: current.up, down: current.down + 1 };
        return { ...prev, [ideaId]: updated };
      });
    },
    []
  );

  const handleBuild = useCallback(async () => {
    if (ideas.length === 0) return;

    setBuildPhase("analyzing");
    setBuildElapsed(0);
    setLiveCode("");
    setStatusMessage("Analyzing votes...");
    setBuiltHtml(null);
    setWinnerTitle(null);
    setBuildReasoning(null);

    const ideasWithVotes = ideas.map((idea) => ({
      ...idea,
      ...(votes[idea.id] ?? { up: 0, down: 0 }),
    }));

    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideasWithVotes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Build request failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedCode = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);
            switch (event.type) {
              case "status":
                setStatusMessage(event.message);
                break;
              case "analysis":
                setWinnerTitle(event.winner.title);
                setBuildReasoning(event.reasoning);
                setBuildPhase("generating");
                setStatusMessage(`Generating ${event.winner.title}...`);
                break;
              case "code":
                accumulatedCode += event.content;
                setLiveCode(accumulatedCode);
                break;
              case "done":
                setBuiltHtml(event.html);
                setBuildPhase("done");
                setStatusMessage("");
                break;
              case "error":
                throw new Error(event.message);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Build request failed") {
              throw e;
            }
          }
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Build failed");
      setBuildPhase("idle");
      setStatusMessage("");
    }
  }, [ideas, votes]);

  const handleCopy = useCallback(async () => {
    if (!builtHtml) return;
    await navigator.clipboard.writeText(builtHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [builtHtml]);

  const getScore = useCallback(
    (ideaId: string) => {
      const v = votes[ideaId];
      return v ? v.up - v.down : 0;
    },
    [votes]
  );

  if (!hydrated) {
    return null;
  }

  const maxScore = Math.max(0, ...ideas.map((i) => getScore(i.id)));
  const isBuilding = buildPhase === "analyzing" || buildPhase === "generating";

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
              disabled={loadingIdeas || isBuilding}
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
              disabled={isBuilding || ideas.length === 0}
              className="px-[24px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#000001", color: "#fff" }}
            >
              {isBuilding ? "Building..." : "Build Winner"}
            </button>
          </div>
        </div>

        {ideas.length === 0 && !loadingIdeas && (
          <div
            className="text-center py-[92px] rounded-[6px] border"
            style={{ borderColor: "#C8CDD1", color: "#797979" }}
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
                style={{ borderColor: "#C8CDD1", background: "#fff" }}
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
                      ▲ {votes[idea.id]?.up ?? 0}
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
                      ▼ {votes[idea.id]?.down ?? 0}
                    </button>
                    <span
                      className="text-[14px] font-bold ml-auto tabular-nums"
                      style={{
                        color:
                          score > 0
                            ? "#1B1B1B"
                            : score < 0
                            ? "#c00"
                            : "#797979",
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

        {(isBuilding || buildPhase === "done") && (
          <div className="mb-[20px]">
            <div
              className="rounded-[6px] overflow-hidden border"
              style={{ borderColor: "#333" }}
            >
              <div
                className="flex items-center justify-between px-[16px] py-[10px]"
                style={{ background: "#1a1a1a" }}
              >
                <div className="flex items-center gap-[8px]">
                  {isBuilding && (
                    <span
                      className="inline-block w-[8px] h-[8px] rounded-full"
                      style={{
                        background:
                          buildPhase === "analyzing" ? "#facc15" : "#22c55e",
                      }}
                    />
                  )}
                  {buildPhase === "done" && (
                    <span
                      className="inline-block w-[8px] h-[8px] rounded-full"
                      style={{ background: "#22c55e" }}
                    />
                  )}
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "#9ca3af" }}
                  >
                    {buildPhase === "done"
                      ? winnerTitle
                        ? `Built: ${winnerTitle} — ${formatElapsed(buildElapsed)}`
                        : `Done — ${formatElapsed(buildElapsed)}`
                      : statusMessage}
                  </span>
                </div>
                <span
                  className="text-[13px] font-mono tabular-nums"
                  style={{ color: "#9ca3af" }}
                >
                  {formatElapsed(buildElapsed)}
                </span>
              </div>
              <div
                className="px-[16px] py-[16px] overflow-auto font-mono text-[13px] leading-[1.6]"
                style={{
                  background: "#0d0d0d",
                  color: "#e2e8f0",
                  maxHeight: "400px",
                }}
              >
                <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {liveCode}
                  {isBuilding && (
                    <span style={{ animation: "blink 1s step-end infinite" }}>
                      ▊
                    </span>
                  )}
                </code>
                <div ref={codeEndRef} />
              </div>
            </div>
          </div>
        )}

        {buildPhase === "done" && builtHtml && (
          <div className="mt-[0px]">
            <div className="flex items-center justify-between mb-[10px]">
              <div>
                {buildReasoning && (
                  <p
                    className="text-[14px] mt-[4px]"
                    style={{ color: "#797979" }}
                  >
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
              style={{ borderColor: "#C8CDD1", background: "#fff" }}
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
