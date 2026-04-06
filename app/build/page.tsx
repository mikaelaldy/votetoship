"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function BuildContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("ideaId") || "";

  const [statusMessage, setStatusMessage] = useState("Initializing...");
  const [reasoning, setReasoning] = useState("");
  const [liveCode, setLiveCode] = useState("");
  const [buildDone, setBuildDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const codeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    codeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveCode]);

  useEffect(() => {
    if (buildDone) return;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [buildDone]);

  const startStream = useCallback(async () => {
    if (!ideaId) {
      setError("Missing ideaId");
      return;
    }

    try {
      const res = await fetch(`/api/build?ideaId=${encodeURIComponent(ideaId)}`, {
        method: "GET",
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Build request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;

          const payload = JSON.parse(line.slice(6));

          if (payload.type === "status") setStatusMessage(payload.message || "Working...");
          if (payload.type === "analysis") setStatusMessage(payload.message || "Analyzing...");
          if (payload.type === "reasoning") setReasoning(payload.content || "");
          if (payload.type === "code") setLiveCode((prev) => prev + (payload.content || ""));

          if (payload.type === "done") {
            setBuildDone(true);
            setStatusMessage(payload.cached ? "Loaded from cache" : "Build complete");
            setSlug(payload.slug || ideaId);
            setTitle(payload.title || "Built app");
          }

          if (payload.type === "error") {
            throw new Error(payload.message || "Build failed");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    }
  }, [ideaId]);

  useEffect(() => {
    startStream();
  }, [startStream]);

  const elapsedLabel = useMemo(() => formatElapsed(elapsed), [elapsed]);

  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1000px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </Link>
          <Link href="/arena" className="text-[14px]" style={{ color: "#797979" }}>
            Back to arena
          </Link>
        </div>
      </nav>

      <main className="max-w-[1000px] mx-auto px-[24px] py-[32px]">
        <div className="flex items-start justify-between gap-[16px]">
          <div>
            <h1 className="text-[32px] font-extrabold" style={{ color: "#1B1B1B" }}>
              {title || "Building idea"}
            </h1>
            <p className="text-[14px] mt-[6px]" style={{ color: "#797979" }}>
              {statusMessage}
            </p>
            {reasoning && (
              <p className="text-[14px] mt-[10px]" style={{ color: "#1B1B1B" }}>
                {reasoning}
              </p>
            )}
          </div>
          <span className="text-[22px] font-mono font-bold" style={{ color: "#797979" }}>
            {elapsedLabel}
          </span>
        </div>

        {error && (
          <div className="mt-[16px] rounded-[8px] border p-[14px]" style={{ borderColor: "#b91c1c", background: "#fff" }}>
            <p style={{ color: "#b91c1c" }}>{error}</p>
          </div>
        )}

        <div className="mt-[18px] rounded-[8px] overflow-hidden border" style={{ borderColor: "#333" }}>
          <div className="px-[14px] py-[10px]" style={{ background: "#1a1a1a", color: "#9ca3af" }}>
            Live generation stream
          </div>
          <div className="px-[14px] py-[14px] font-mono text-[13px] overflow-auto" style={{ background: "#0d0d0d", color: "#e2e8f0", maxHeight: "420px" }}>
            <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {liveCode}
              {!buildDone && !error ? <span style={{ animation: "blink 1s step-end infinite" }}>▋</span> : null}
            </code>
            <div ref={codeEndRef} />
          </div>
        </div>

        {buildDone && (
          <div className="mt-[16px] flex items-center gap-[12px]">
            <button
              onClick={() => router.push(`/app/${slug || ideaId}`)}
              className="px-[18px] py-[10px] rounded-[20px] text-[14px] font-semibold"
              style={{ background: "#000001", color: "#fff" }}
            >
              Open landing / MVP viewer
            </button>
            <button
              onClick={() => router.push("/arena")}
              className="px-[18px] py-[10px] rounded-[20px] text-[14px] font-semibold border"
              style={{ borderColor: "#C8CDD1", background: "#fff", color: "#1B1B1B" }}
            >
              Back to arena
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function BuildPage() {
  return (
    <Suspense>
      <BuildContent />
    </Suspense>
  );
}
