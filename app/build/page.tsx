"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    if (buildDone) return;
    const interval = setInterval(() => {
      setBuildElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [buildDone]);

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

  const startBuild = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    setStatusMessage("Analyzing votes...");

    try {
      const res = await fetch("/api/build", { method: "POST" });

      if (!res.ok) {
        let msg = "Build request failed";
        try {
          const data = await res.json();
          msg = data.error || msg;
        } catch {}
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

          try {
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
                setStatusMessage("");
                break;
              case "error":
                throw new Error(event.message);
            }
          } catch (e) {
            if (e instanceof Error) throw e;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    }
  }, []);

  useEffect(() => {
    if (hydrated && !hasStarted.current) {
      startBuild();
    }
  }, [hydrated, startBuild]);

  const handleNewBattle = useCallback(() => {
    router.push("/arena?reset=1");
  }, [router]);

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

      <main className="max-w-[1000px] mx-auto px-[24px] py-[40px]">
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

        {!error && (
          <>
            <div className="flex items-center justify-between mb-[20px]">
              <div>
                {winnerTitle && (
                  <h1
                    className="text-[32px] font-extrabold"
                    style={{ color: "#1B1B1B" }}
                  >
                    {buildDone ? `Built: ${winnerTitle}` : "Building..."}
                  </h1>
                )}
                {!winnerTitle && (
                  <h1
                    className="text-[32px] font-extrabold"
                    style={{ color: "#1B1B1B" }}
                  >
                    GLM 5.1 at work
                  </h1>
                )}
                {buildReasoning && (
                  <p
                    className="text-[14px] mt-[4px]"
                    style={{ color: "#797979" }}
                  >
                    {buildReasoning}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-[16px]">
                <span
                  className="text-[24px] font-mono font-bold tabular-nums"
                  style={{ color: buildDone ? "#22c55e" : "#797979" }}
                >
                  {formatElapsed(buildElapsed)}
                </span>
              </div>
            </div>

            <div
              className="rounded-[6px] overflow-hidden border"
              style={{ borderColor: "#333" }}
            >
              <div
                className="flex items-center justify-between px-[16px] py-[10px]"
                style={{ background: "#1a1a1a" }}
              >
                <div className="flex items-center gap-[8px]">
                  <span
                    className="inline-block w-[8px] h-[8px] rounded-full"
                    style={{
                      background: buildDone
                        ? "#22c55e"
                        : statusMessage.includes("Analyzing")
                        ? "#facc15"
                        : "#22c55e",
                    }}
                  />
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "#9ca3af" }}
                  >
                    {buildDone ? "Complete" : statusMessage}
                  </span>
                </div>
              </div>
              <div
                className="px-[16px] py-[16px] overflow-auto font-mono text-[13px] leading-[1.6]"
                style={{
                  background: "#0d0d0d",
                  color: "#e2e8f0",
                  maxHeight: "400px",
                }}
              >
                <code
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {liveCode}
                  {!buildDone && (
                    <span
                      style={{
                        animation: "blink 1s step-end infinite",
                      }}
                    >
                      ▊
                    </span>
                  )}
                </code>
                <div ref={codeEndRef} />
              </div>
            </div>

            {buildDone && redirectCountdown !== null && (
              <div className="mt-[20px] flex items-center justify-center gap-[16px]">
                <button
                  onClick={handleNewBattle}
                  className="px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer border"
                  style={{
                    borderColor: "#C8CDD1",
                    background: "transparent",
                    color: "#1B1B1B",
                  }}
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
              What's Next
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
