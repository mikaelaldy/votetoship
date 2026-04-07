"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
});

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type StreamTab = "raw" | "pretty" | "jsonReasoning" | "landing" | "app";

interface DonePayload {
  slug?: string;
  title?: string;
  reasoning?: string;
  landingHtml?: string;
  appHtml?: string;
  cached?: boolean;
}

function tryParsePayload(raw: string): {
  reasoning?: string;
  landingHtml?: string;
  appHtml?: string;
} | null {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(raw.slice(first, last + 1)) as Record<string, unknown>;
    if (
      typeof parsed.reasoning === "string" &&
      typeof parsed.landingHtml === "string" &&
      typeof parsed.appHtml === "string"
    ) {
      return {
        reasoning: parsed.reasoning,
        landingHtml: parsed.landingHtml,
        appHtml: parsed.appHtml,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function BuildContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("ideaId") || "";
  const forceFlag = searchParams.get("forceRebuild") === "1";

  const [statusMessage, setStatusMessage] = useState("Initializing...");
  const [planMarkdown, setPlanMarkdown] = useState("");
  const [codegenThinking, setCodegenThinking] = useState("");
  const [liveCode, setLiveCode] = useState("");
  const [buildDone, setBuildDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [forceRebuild, setForceRebuild] = useState(forceFlag);
  const [streamTab, setStreamTab] = useState<StreamTab>("raw");
  const [wrapLines, setWrapLines] = useState(false);
  const [previewMode, setPreviewMode] = useState<"landing" | "app">("landing");
  const [donePayload, setDonePayload] = useState<DonePayload | null>(null);
  const [copied, setCopied] = useState(false);
  const codeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    codeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveCode, codegenThinking, streamTab]);

  useEffect(() => {
    if (buildDone) return;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [buildDone]);

  const parsedStream = useMemo(() => tryParsePayload(liveCode), [liveCode]);

  const prettyJson = useMemo(() => {
    const parsed = tryParsePayload(liveCode);
    if (!parsed) return null;
    try {
      return JSON.stringify(
        {
          reasoning: parsed.reasoning,
          landingHtml: parsed.landingHtml,
          appHtml: parsed.appHtml,
        },
        null,
        2
      );
    } catch {
      return null;
    }
  }, [liveCode]);

  const displayForTab = useMemo(() => {
    if (streamTab === "raw") return liveCode;
    if (streamTab === "pretty") return prettyJson ?? liveCode;
    if (streamTab === "jsonReasoning") {
      const r = donePayload?.reasoning ?? parsedStream?.reasoning;
      if (!r) return "";
      return JSON.stringify({ reasoning: r }, null, 2);
    }
    if (streamTab === "landing") {
      return donePayload?.landingHtml ?? parsedStream?.landingHtml ?? "";
    }
    if (streamTab === "app") {
      return donePayload?.appHtml ?? parsedStream?.appHtml ?? "";
    }
    return "";
  }, [streamTab, liveCode, prettyJson, donePayload, parsedStream]);

  const languageForTab = useMemo<"json" | "markup">(() => {
    if (streamTab === "pretty" || streamTab === "raw") return "json";
    if (streamTab === "jsonReasoning") return "json";
    return "markup";
  }, [streamTab]);

  const copyVisible = useCallback(async () => {
    const text = displayForTab;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [displayForTab]);

  const downloadVisible = useCallback(() => {
    const text = displayForTab;
    if (!text) return;
    const ext =
      streamTab === "landing" || streamTab === "app"
        ? "html"
        : streamTab === "pretty" || streamTab === "raw"
          ? "json.txt"
          : "txt";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `votetoship-build-${ideaId || "stream"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [displayForTab, streamTab, ideaId]);

  const startStream = useCallback(async () => {
    if (!ideaId) {
      setError("Missing ideaId");
      return;
    }

    try {
      setBuildDone(false);
      setError(null);
      setStatusMessage("Initializing...");
      setPlanMarkdown("");
      setCodegenThinking("");
      setLiveCode("");
      setDonePayload(null);
      setElapsed(0);
      setStreamTab("raw");

      const query = new URLSearchParams({
        ideaId,
        ...(forceRebuild ? { forceRebuild: "1" } : {}),
      });
      const res = await fetch(`/api/build?${query.toString()}`, {
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
          if (payload.type === "reasoning") setPlanMarkdown(payload.content || "");
          if (payload.type === "thinking_delta") {
            setCodegenThinking((prev) => prev + (payload.content || ""));
          }
          if (payload.type === "code") setLiveCode((prev) => prev + (payload.content || ""));

          if (payload.type === "done") {
            setBuildDone(true);
            setStatusMessage(payload.cached ? "Loaded from cache" : "Build complete");
            setSlug(payload.slug || ideaId);
            setTitle(payload.title || "Built app");
            setDonePayload({
              slug: payload.slug,
              title: payload.title,
              reasoning: payload.reasoning,
              landingHtml: payload.landingHtml,
              appHtml: payload.appHtml,
              cached: payload.cached,
            });
          }

          if (payload.type === "error") {
            throw new Error(payload.message || "Build failed");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    }
  }, [forceRebuild, ideaId]);

  useEffect(() => {
    startStream();
  }, [startStream, attempt]);

  const elapsedLabel = useMemo(() => formatElapsed(elapsed), [elapsed]);

  const previewHtml =
    previewMode === "landing"
      ? donePayload?.landingHtml ?? ""
      : donePayload?.appHtml ?? "";

  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1100px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </Link>
          <Link href="/arena" className="text-[14px]" style={{ color: "#797979" }}>
            Back to arena
          </Link>
        </div>
      </nav>

      <main className="max-w-[1100px] mx-auto px-[24px] py-[32px]">
        <div className="flex items-start justify-between gap-[16px]">
          <div>
            <h1 className="text-[32px] font-extrabold" style={{ color: "#1B1B1B" }}>
              {title || "Building idea"}
            </h1>
            <p className="text-[14px] mt-[6px]" style={{ color: "#797979" }}>
              {statusMessage}
            </p>
          </div>
          <span className="text-[22px] font-mono font-bold" style={{ color: "#797979" }}>
            {elapsedLabel}
          </span>
        </div>

        {planMarkdown ? (
          <section
            className="mt-[20px] rounded-[10px] border p-[18px] max-w-[800px]"
            style={{ borderColor: "#C8CDD1", background: "#fff" }}
          >
            <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-[10px]" style={{ color: "#797979" }}>
              Plan
            </h2>
            <div className="max-w-none text-[14px] leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:mt-2 [&_strong]:font-semibold" style={{ color: "#1B1B1B" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{planMarkdown}</ReactMarkdown>
            </div>
          </section>
        ) : null}

        {codegenThinking ? (
          <section
            className="mt-[14px] rounded-[10px] border p-[18px] max-w-[800px]"
            style={{ borderColor: "#C8CDD1", background: "#fff" }}
          >
            <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-[10px]" style={{ color: "#797979" }}>
              Model thinking (during codegen)
            </h2>
            <div className="max-w-none text-[14px] whitespace-pre-wrap leading-relaxed" style={{ color: "#374151" }}>
              {codegenThinking}
            </div>
          </section>
        ) : null}

        {error && (
          <div
            className="mt-[16px] rounded-[8px] border p-[14px]"
            style={{ borderColor: "#b91c1c", background: "#fff" }}
          >
            <p style={{ color: "#b91c1c" }}>{error}</p>
            <div className="mt-[10px] flex items-center gap-[10px]">
              <button
                onClick={() => {
                  setForceRebuild(false);
                  setAttempt((v) => v + 1);
                }}
                className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
                style={{ background: "#000001", color: "#fff" }}
              >
                Retry build
              </button>
              <button
                onClick={() => {
                  setForceRebuild(true);
                  setAttempt((v) => v + 1);
                }}
                className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold border"
                style={{ borderColor: "#C8CDD1", background: "#fff", color: "#1B1B1B" }}
              >
                Force rebuild
              </button>
            </div>
          </div>
        )}

        <div className="mt-[18px] rounded-[8px] overflow-hidden border" style={{ borderColor: "#333" }}>
          <div
            className="px-[14px] py-[10px] flex flex-wrap items-center justify-between gap-[10px]"
            style={{ background: "#1a1a1a", color: "#9ca3af" }}
          >
            <span className="text-[13px] font-medium">Live generation</span>
            <div className="flex flex-wrap items-center gap-[8px]">
              <button
                type="button"
                onClick={() => setWrapLines((v) => !v)}
                className="text-[12px] px-[10px] py-[2px] rounded border"
                style={{ borderColor: "#444", color: "#e5e7eb", background: "#111" }}
              >
                {wrapLines ? "No wrap" : "Wrap lines"}
              </button>
              <button
                type="button"
                onClick={() => void copyVisible()}
                className="text-[12px] px-[10px] py-[2px] rounded border"
                style={{ borderColor: "#444", color: "#e5e7eb", background: "#111" }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={downloadVisible}
                className="text-[12px] px-[10px] py-[2px] rounded border"
                style={{ borderColor: "#444", color: "#e5e7eb", background: "#111" }}
              >
                Download
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-[6px] px-[10px] py-[8px]" style={{ background: "#141414" }}>
            {(
              [
                ["raw", "Raw stream"] as const,
                ["pretty", "Pretty JSON"] as const,
                ["jsonReasoning", "Reasoning (JSON)"] as const,
                ["landing", "Landing HTML"] as const,
                ["app", "App HTML"] as const,
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStreamTab(id)}
                className="text-[12px] px-[10px] py-[4px] rounded-full font-medium"
                style={{
                  background: streamTab === id ? "#2563eb" : "#262626",
                  color: "#e5e7eb",
                  border: streamTab === id ? "none" : "1px solid #333",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className={`${jetbrains.className} overflow-auto`}
            style={{ background: "#0d0d0d", maxHeight: "420px" }}
          >
            {streamTab === "jsonReasoning" && !displayForTab ? (
              <p className="p-[14px] text-[13px]" style={{ color: "#9ca3af" }}>
                Reasoning field appears when the JSON payload is complete or after build finishes.
              </p>
            ) : (streamTab === "landing" || streamTab === "app") && !displayForTab ? (
              <p className="p-[14px] text-[13px]" style={{ color: "#9ca3af" }}>
                HTML is available once the model finishes the JSON object or when the build completes.
              </p>
            ) : (
              <SyntaxHighlighter
                language={languageForTab}
                style={oneDark}
                customStyle={{
                  margin: 0,
                  padding: 14,
                  fontSize: 12,
                  lineHeight: 1.5,
                  background: "#0d0d0d",
                }}
                showLineNumbers
                wrapLongLines={wrapLines}
              >
                {`${displayForTab}${!buildDone && !error && streamTab === "raw" ? "▋" : ""}`}
              </SyntaxHighlighter>
            )}
            <div ref={codeEndRef} />
          </div>
        </div>

        {!buildDone && !error && (
          <div className="mt-[12px] flex items-center gap-[10px]">
            <button
              onClick={() => {
                setForceRebuild(false);
                setAttempt((v) => v + 1);
              }}
              className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold border"
              style={{ borderColor: "#C8CDD1", background: "#fff", color: "#1B1B1B" }}
            >
              Retry
            </button>
            <button
              onClick={() => {
                setForceRebuild(true);
                setAttempt((v) => v + 1);
              }}
              className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold border"
              style={{ borderColor: "#C8CDD1", background: "#fff", color: "#1B1B1B" }}
            >
              Force rebuild
            </button>
          </div>
        )}

        {buildDone && donePayload && (donePayload.landingHtml || donePayload.appHtml) && (
          <section className="mt-[24px]">
            <h2 className="text-[18px] font-bold mb-[10px]" style={{ color: "#1B1B1B" }}>
              Preview
            </h2>
            <div className="flex flex-wrap gap-[8px] mb-[10px]">
              <button
                type="button"
                onClick={() => setPreviewMode("landing")}
                className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
                style={{
                  background: previewMode === "landing" ? "#000001" : "#fff",
                  color: previewMode === "landing" ? "#fff" : "#1B1B1B",
                  border: "1px solid #C8CDD1",
                }}
              >
                Landing
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("app")}
                className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
                style={{
                  background: previewMode === "app" ? "#000001" : "#fff",
                  color: previewMode === "app" ? "#fff" : "#1B1B1B",
                  border: "1px solid #C8CDD1",
                }}
              >
                MVP app
              </button>
            </div>
            <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  sandbox="allow-scripts"
                  className="w-full border-none"
                  style={{ height: "560px" }}
                  title="build-preview"
                />
              ) : (
                <p className="p-[16px] text-[14px]" style={{ color: "#797979" }}>
                  No HTML for this preview mode.
                </p>
              )}
            </div>
          </section>
        )}

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
