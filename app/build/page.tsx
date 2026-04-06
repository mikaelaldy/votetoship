"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Round {
  id: string;
  status: "OPEN_VOTING" | "BUILDING" | "SHOWCASE" | "ERROR";
  startsAt: number;
  endsAt: number;
  winnerSlug?: string;
  buildError?: string;
}

interface RoundState {
  round: Round;
  serverTime: number;
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function BuildPage() {
  const router = useRouter();

  const [winnerTitle, setWinnerTitle] = useState<string | null>(null);
  const [buildReasoning, setBuildReasoning] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [liveCode, setLiveCode] = useState("");
  const [buildElapsed, setBuildElapsed] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Initializing...");
  const [buildDone, setBuildDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [roundStatus, setRoundStatus] = useState<Round["status"] | null>(null);
  const [timeUntilBuildMs, setTimeUntilBuildMs] = useState(0);

  const codeEndRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const slugRef = useRef<string>("");

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    codeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveCode]);

  useEffect(() => {
    if (buildDone || roundStatus !== "BUILDING") return;
    const interval = setInterval(() => {
      setBuildElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [buildDone, roundStatus]);

  useEffect(() => {
    if (!buildDone) return;

    setRedirectCountdown(5);
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          router.push(`/app/${slugRef.current || "untitled"}`);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [buildDone, router]);

  const fetchRound = useCallback(async (): Promise<RoundState | null> => {
    try {
      const res = await fetch("/api/round/current", { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as RoundState;
    } catch {
      return null;
    }
  }, []);

  const startBuild = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    setStatusMessage("Analyzing votes...");

    try {
      const res = await fetch("/api/build", { method: "POST" });

      if (!res.ok) {
        if (res.status === 409) {
          setStatusMessage("Another builder is active. Waiting for completion...");
          hasStarted.current = false;
          return;
        }

        let msg = "Build request failed";
        try {
          const data = await res.json();
          msg = data.error || msg;
        } catch {
          // no-op
        }
        throw new Error(msg);
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

          const event = JSON.parse(raw);
          switch (event.type) {
            case "status":
              setStatusMessage(event.message);
              break;
            case "analysis":
              setWinnerTitle(event.winner.title);
              setBuildReasoning(event.reasoning);
              slugRef.current = event.slug || "";
              setStatusMessage(`Generating ${event.winner.title}...`);
              break;
            case "code":
              accumulatedCode += event.content;
              setLiveCode(accumulatedCode);
              break;
            case "done":
              slugRef.current = event.slug || slugRef.current;
              setBuildDone(true);
              setStatusMessage("Build complete");
              break;
            case "error":
              throw new Error(event.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
      hasStarted.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const state = await fetchRound();
      if (!state) {
        setError("Could not load round state");
        return;
      }

      setRoundStatus(state.round.status);

      if (state.round.status === "OPEN_VOTING") {
        setTimeUntilBuildMs(Math.max(0, state.round.endsAt - state.serverTime));
        timer = setInterval(async () => {
          const current = await fetchRound();
          if (!current) return;
          setRoundStatus(current.round.status);
          setTimeUntilBuildMs(Math.max(0, current.round.endsAt - current.serverTime));
          if (current.round.status === "BUILDING") {
            setStatusMessage("Round moved to build phase...");
            startBuild();
          }
        }, 2000);
        return;
      }

      if (state.round.status === "SHOWCASE" && state.round.winnerSlug) {
        router.replace(`/app/${state.round.winnerSlug}`);
        return;
      }

      if (state.round.status === "ERROR") {
        setError(state.round.buildError || "Round is in error state");
        return;
      }

      if (state.round.status === "BUILDING") {
        startBuild();
      }
    })();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [hydrated, fetchRound, router, startBuild]);

  useEffect(() => {
    if (!roundStatus) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const state = await fetchRound();
      if (!state) return;

      const mod = await import("pusher-js");
      const Pusher = mod.default;
      const pusher = new Pusher(key, { cluster });

      const roundChannel = pusher.subscribe(`round-${state.round.id}`);
      roundChannel.bind("round.updated", (event: { round?: Round }) => {
        if (!event?.round) return;

        setRoundStatus(event.round.status);

        if (event.round.status === "BUILDING" && !hasStarted.current) {
          startBuild();
        }

        if (event.round.status === "SHOWCASE" && event.round.winnerSlug) {
          router.replace(`/app/${event.round.winnerSlug}`);
        }
      });

      cleanup = () => {
        roundChannel.unbind_all();
        pusher.unsubscribe(`round-${state.round.id}`);
        pusher.disconnect();
      };
    })();

    return () => {
      if (cleanup) cleanup();
    };
  }, [roundStatus, fetchRound, router, startBuild]);

  const handleNewBattle = useCallback(() => {
    router.push("/arena?reset=1");
  }, [router]);

  if (!hydrated) return null;

  const waitMinutes = Math.floor(timeUntilBuildMs / 60000);
  const waitSeconds = Math.ceil((timeUntilBuildMs % 60000) / 1000);

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

      <main className="max-w-[1000px] mx-auto px-[24px] py-[40px]">
        {roundStatus === "OPEN_VOTING" && !error && (
          <div
            className="rounded-[6px] border p-[24px] text-center mb-[16px]"
            style={{ borderColor: "#C8CDD1", background: "#fff" }}
          >
            <p className="text-[18px] font-semibold" style={{ color: "#1B1B1B" }}>
              Build starts when voting window closes.
            </p>
            <p className="text-[14px] mt-[6px]" style={{ color: "#797979" }}>
              Time remaining: {waitMinutes}m {waitSeconds}s
            </p>
            <Link
              href="/arena"
              className="inline-block mt-[14px] px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium"
              style={{ background: "#000001", color: "#fff" }}
            >
              Back to Arena
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-[20px]">
            <div
              className="rounded-[6px] border p-[24px] text-center"
              style={{ borderColor: "#c00", background: "#fff" }}
            >
              <p className="text-[16px] font-medium" style={{ color: "#c00" }}>
                {error}
              </p>
              <button
                onClick={handleNewBattle}
                className="mt-[12px] px-[24px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer"
                style={{ background: "#000001", color: "#fff" }}
              >
                Back to Arena
              </button>
            </div>
          </div>
        )}

        {!error && roundStatus === "BUILDING" && (
          <>
            <div className="flex items-center justify-between mb-[20px]">
              <div>
                {winnerTitle ? (
                  <h1 className="text-[32px] font-extrabold" style={{ color: "#1B1B1B" }}>
                    {buildDone ? `Built: ${winnerTitle}` : "Building..."}
                  </h1>
                ) : (
                  <h1 className="text-[32px] font-extrabold" style={{ color: "#1B1B1B" }}>
                    GLM 5.1 at work
                  </h1>
                )}
                {buildReasoning && (
                  <p className="text-[14px] mt-[4px]" style={{ color: "#797979" }}>
                    {buildReasoning}
                  </p>
                )}
              </div>
              <span
                className="text-[24px] font-mono font-bold tabular-nums"
                style={{ color: buildDone ? "#22c55e" : "#797979" }}
              >
                {formatElapsed(buildElapsed)}
              </span>
            </div>

            <div className="rounded-[6px] overflow-hidden border" style={{ borderColor: "#333" }}>
              <div
                className="flex items-center justify-between px-[16px] py-[10px]"
                style={{ background: "#1a1a1a" }}
              >
                <div className="flex items-center gap-[8px]">
                  <span
                    className="inline-block w-[8px] h-[8px] rounded-full"
                    style={{ background: buildDone ? "#22c55e" : "#facc15" }}
                  />
                  <span className="text-[13px] font-medium" style={{ color: "#9ca3af" }}>
                    {statusMessage}
                  </span>
                </div>
              </div>
              <div
                className="px-[16px] py-[16px] overflow-auto font-mono text-[13px] leading-[1.6]"
                style={{ background: "#0d0d0d", color: "#e2e8f0", maxHeight: "400px" }}
              >
                <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {liveCode}
                  {!buildDone && <span style={{ animation: "blink 1s step-end infinite" }}>▋</span>}
                </code>
                <div ref={codeEndRef} />
              </div>
            </div>

            {buildDone && redirectCountdown !== null && (
              <div className="mt-[20px] flex items-center justify-center gap-[16px]">
                <button
                  onClick={handleNewBattle}
                  className="px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer border"
                  style={{ borderColor: "#C8CDD1", background: "transparent", color: "#1B1B1B" }}
                >
                  New Battle
                </button>
                <span className="text-[14px]" style={{ color: "#797979" }}>
                  Opening app in {redirectCountdown}s...
                </span>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t py-[20px]" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1000px] mx-auto px-[24px] text-center">
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

