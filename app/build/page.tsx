"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
import dynamic from "next/dynamic";
import { getStoredAdminToken } from "@/lib/admin-client";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Prism),
  { ssr: false }
);

let oneDark: React.ComponentProps<typeof SyntaxHighlighter>["style"];
import("react-syntax-highlighter/dist/esm/styles/prism").then((mod) => {
  oneDark = mod.oneDark;
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
});

const BUILD_CACHE_PREFIX = "vts_build_stream:";

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type StreamTab = "landing" | "app";
type BuildPhase = "boot" | "landing" | "app" | "done";

function getBuildCacheKey(ideaId: string) {
  return `${BUILD_CACHE_PREFIX}${ideaId}`;
}

function readBuildCache(ideaId: string) {
  if (!ideaId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getBuildCacheKey(ideaId));
    if (!raw) return null;
    return JSON.parse(raw) as {
      statusMessage?: string;
      buildDone?: boolean;
      slug?: string;
      title?: string;
      streamTab?: StreamTab;
      previewMode?: "landing" | "app";
      buildPhase?: BuildPhase;
      phaseStatus?: "idle" | "streaming" | "retrying";
      landingHtml?: string;
      appHtml?: string;
      startedAt?: string;
      completedAt?: string;
    };
  } catch {
    return null;
  }
}

function clearBuildCache(ideaId: string) {
  if (!ideaId || typeof window === "undefined") return;
  window.localStorage.removeItem(getBuildCacheKey(ideaId));
}

function getElapsedFromTimestamps(startedAt?: string, completedAt?: string) {
  const startedMs = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(startedMs)) return 0;
  const endMs = completedAt ? Date.parse(completedAt) : Date.now();
  if (!Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startedMs) / 1000));
}

function BuildContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("ideaId") || "";
  const forceFlag = searchParams.get("forceRebuild") === "1";

  const [statusMessage, setStatusMessage] = useState("Initializing...");
  const [buildDone, setBuildDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [forceRebuild, setForceRebuild] = useState(forceFlag);
  const [streamTab, setStreamTab] = useState<StreamTab>("landing");
  const [previewMode, setPreviewMode] = useState<"landing" | "app">("landing");
  const [copied, setCopied] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [buildPhase, setBuildPhase] = useState<BuildPhase>("boot");
  const [phaseStatus, setPhaseStatus] = useState<"idle" | "streaming" | "retrying">("idle");
  const [landingHtml, setLandingHtml] = useState("");
  const [appHtml, setAppHtml] = useState("");
  const [tabNotice, setTabNotice] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const resetOnNextStreamRef = useRef(forceFlag);

  useEffect(() => {
    if (!ideaId) return;
    const cached = readBuildCache(ideaId);
    if (!cached) return;

    setStatusMessage(cached.statusMessage || "Reconnecting to saved build...");
    setBuildDone(Boolean(cached.buildDone));
    setSlug(cached.slug || "");
    setTitle(cached.title || "");
    setStreamTab(cached.streamTab || "landing");
    setPreviewMode(cached.previewMode || "landing");
    setBuildPhase(cached.buildPhase || "boot");
    setPhaseStatus(cached.phaseStatus || "idle");
    setLandingHtml(cached.landingHtml || "");
    setAppHtml(cached.appHtml || "");
    setStartedAt(cached.startedAt || "");
    setCompletedAt(cached.completedAt || "");
    setElapsed(getElapsedFromTimestamps(cached.startedAt, cached.completedAt));
  }, [ideaId]);

  useEffect(() => {
    if (!ideaId) return;
    const payload = {
      statusMessage,
      buildDone,
      slug,
      title,
      streamTab,
      previewMode,
      buildPhase,
      phaseStatus,
      landingHtml,
      appHtml,
      startedAt,
      completedAt,
    };
    window.localStorage.setItem(getBuildCacheKey(ideaId), JSON.stringify(payload));
  }, [
    appHtml,
    buildDone,
    buildPhase,
    ideaId,
    landingHtml,
    phaseStatus,
    previewMode,
    completedAt,
    slug,
    startedAt,
    statusMessage,
    streamTab,
    title,
  ]);

  useEffect(() => {
    const container = codeContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldStickToBottom = streaming || distanceFromBottom < 96;

    if (shouldStickToBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: streaming ? "smooth" : "auto",
      });
    }
  }, [landingHtml, appHtml, streamTab, streaming]);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(getElapsedFromTimestamps(startedAt, completedAt));
    if (buildDone) return;
    const timer = setInterval(
      () => setElapsed(getElapsedFromTimestamps(startedAt, completedAt)),
      1000
    );
    return () => clearInterval(timer);
  }, [buildDone, completedAt, startedAt]);

  const copyVisible = useCallback(async () => {
    const text = streamTab === "landing" ? landingHtml : appHtml;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [appHtml, landingHtml, streamTab]);

  const downloadVisible = useCallback(() => {
    const text = streamTab === "landing" ? landingHtml : appHtml;
    if (!text) return;
    const blob = new Blob([text], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `votetoship-build-${ideaId || "stream"}-${streamTab}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [appHtml, ideaId, landingHtml, streamTab]);

  const openTab = useCallback(
    (tab: StreamTab) => {
      if (tab === "app" && buildPhase === "landing") {
        setTabNotice("Landing page is still generating. Wait for it to finish before the app HTML starts.");
      } else {
        setTabNotice("");
      }
      setStreamTab(tab);
    },
    [buildPhase]
  );

  const startStream = useCallback(async () => {
    if (!ideaId) {
      setError("Missing ideaId");
      return;
    }

    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      setBuildDone(false);
      setError(null);
      setTabNotice("");

      if (resetOnNextStreamRef.current) {
        resetOnNextStreamRef.current = false;
        clearBuildCache(ideaId);
        setStatusMessage("Initializing...");
        setLandingHtml("");
        setAppHtml("");
        setElapsed(0);
        setStartedAt("");
        setCompletedAt("");
        setStreamTab("landing");
        setPreviewMode("landing");
        setBuildPhase("boot");
        setPhaseStatus("idle");
      } else {
        setStatusMessage((prev) => prev || "Reconnecting to saved build...");
      }

      const query = new URLSearchParams({
        ideaId,
        ...(forceRebuild ? { forceRebuild: "1" } : {}),
      });

      setStreaming(true);
      const adminToken = getStoredAdminToken();
      const res = await fetch(`/api/build?${query.toString()}`, {
        method: "GET",
        signal,
        headers: adminToken ? { "x-admin-token": adminToken } : undefined,
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

          if (payload.type === "status") {
            const nextMessage = payload.message || "Working...";
            setStatusMessage(nextMessage);
            if (nextMessage.toLowerCase().includes("retrying")) {
              setPhaseStatus("retrying");
            } else if (
              nextMessage.toLowerCase().includes("generating") ||
              nextMessage.toLowerCase().includes("starting")
            ) {
              setPhaseStatus("streaming");
            }
          }
          if (payload.type === "snapshot") {
            setSlug(payload.slug || "");
            setTitle(payload.title || "Built app");
            setStatusMessage(payload.statusMessage || "Reconnecting to saved build...");
            setLandingHtml(payload.landingHtml || "");
            setAppHtml(payload.appHtml || "");
            setStartedAt(payload.startedAt || "");
            setCompletedAt(payload.completedAt || "");
            setBuildPhase(payload.buildPhase || "boot");
            setBuildDone(payload.status === "completed");
            setElapsed(getElapsedFromTimestamps(payload.startedAt, payload.completedAt));
            setPhaseStatus(
              payload.status === "completed"
                ? "idle"
                : payload.landingHtml || payload.appHtml
                  ? "streaming"
                  : "idle"
            );
          }
          if (payload.type === "phase") {
            setBuildPhase(payload.phase || "boot");
            if (payload.phase === "landing") {
              setStreamTab("landing");
              setPreviewMode("landing");
            }
            if (payload.phase === "app") {
              setTabNotice("");
            }
          }
          if (payload.type === "landing_chunk") {
            setLandingHtml((prev) => prev + (payload.content || ""));
          }
          if (payload.type === "app_chunk") {
            setAppHtml((prev) => prev + (payload.content || ""));
          }
          if (payload.type === "landing_done") {
            setStatusMessage("Landing page complete. Starting MVP app HTML...");
            setBuildPhase("app");
            setPhaseStatus("streaming");
          }
          if (payload.type === "app_done") {
            setStatusMessage("MVP app HTML complete.");
            setPhaseStatus("idle");
          }

          if (payload.type === "done") {
            setBuildDone(true);
            setBuildPhase("done");
            setPhaseStatus("idle");
            setStatusMessage(payload.cached ? "Loaded from cache" : "Build complete");
            setSlug(payload.slug || ideaId);
            setTitle(payload.title || "Built app");
            setLandingHtml(payload.landingHtml || "");
            setAppHtml(payload.appHtml || "");
            setStartedAt(payload.startedAt || "");
            setCompletedAt(payload.completedAt || new Date().toISOString());
            setElapsed(getElapsedFromTimestamps(payload.startedAt, payload.completedAt));
          }

          if (payload.type === "error") {
            const msg = payload.message || "Build failed";
            if (msg === "Build stopped" || msg.includes("stopped")) {
              setStatusMessage(msg);
              setError(null);
              return;
            }
            throw new Error(msg);
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatusMessage("Build stopped");
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setStreaming(false);
    }
  }, [forceRebuild, ideaId]);

  useEffect(() => {
    startStream();
  }, [startStream, attempt]);

  const elapsedLabel = useMemo(() => formatElapsed(elapsed), [elapsed]);
  const phaseBadge = useMemo(() => {
    if (buildPhase === "done") return "Finished";
    if (buildPhase === "landing") {
      return phaseStatus === "retrying" ? "Retrying landing page" : "Building landing page";
    }
    if (buildPhase === "app") {
      return phaseStatus === "retrying" ? "Retrying MVP app" : "Building MVP app";
    }
    return "Preparing build";
  }, [buildPhase, phaseStatus]);

  const displayForTab = streamTab === "landing" ? landingHtml : appHtml;
  const previewHtml = previewMode === "landing" ? landingHtml : appHtml;
  const waitingForApp = streamTab === "app" && buildPhase === "landing";

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="text-lg font-bold text-[var(--color-text-primary)]">
            VoteToShip
          </Link>
          <Link href="/arena" className="pill-button pill-button-secondary">
            Back to arena
          </Link>
        </div>
      </nav>

      <main className="app-container page-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Build stream</p>
            <h1 className="balance mt-4 text-[32px] font-extrabold leading-none text-[var(--color-text-primary)] sm:text-[36px]">
              {title || "Building idea"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
              {statusMessage}
            </p>
          </div>
          <span className="rounded-[23px] border border-[var(--color-border-default)] px-4 py-3 text-xl font-mono font-bold tabular-nums text-[var(--color-text-secondary)]">
            {elapsedLabel}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
          <span className="panel px-4 py-2 shadow-none">
            {buildPhase === "landing" || buildPhase === "boot"
              ? "Step 1 of 2: Landing page"
              : buildPhase === "app"
                ? "Step 2 of 2: MVP app"
                : "Finished"}
          </span>
          <span className="panel px-4 py-2 shadow-none">
            {phaseBadge}
          </span>
          <span className="panel px-4 py-2 shadow-none">
            Landing {landingHtml ? "streaming" : "queued"}
          </span>
          <span className="panel px-4 py-2 shadow-none">
            App {appHtml ? "streaming" : buildPhase === "landing" || buildPhase === "boot" ? "waiting" : "queued"}
          </span>
        </div>

        {error && (
          <div className="panel mt-4 border-red-700 p-[14px]">
            <p className="text-red-700">{error}</p>
            <div className="mt-[10px] flex flex-wrap items-center gap-[10px]">
              <button
                onClick={() => {
                  setForceRebuild(false);
                  resetOnNextStreamRef.current = false;
                  setAttempt((v) => v + 1);
                }}
                className="pill-button pill-button-primary"
              >
                Retry build
              </button>
              <button
                onClick={() => {
                  setForceRebuild(true);
                  resetOnNextStreamRef.current = true;
                  setAttempt((v) => v + 1);
                }}
                className="pill-button pill-button-secondary"
              >
                Force rebuild
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-[16px] border border-[#333] bg-[#0d0d0d]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232323] px-4 py-3 text-[#9ca3af]">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openTab("landing")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  streamTab === "landing"
                    ? "bg-[#2563eb] text-white"
                    : "border border-[#333] bg-[#1a1a1a] text-[#e5e7eb]"
                }`}
              >
                Landing HTML
              </button>
              <button
                type="button"
                onClick={() => openTab("app")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  streamTab === "app"
                    ? "bg-[#2563eb] text-white"
                    : "border border-[#333] bg-[#1a1a1a] text-[#e5e7eb]"
                }`}
              >
                App HTML
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyVisible()}
                className="rounded border border-[#444] bg-[#111] px-3 py-1 text-xs text-[#e5e7eb]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={downloadVisible}
                className="rounded border border-[#444] bg-[#111] px-3 py-1 text-xs text-[#e5e7eb]"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                disabled={!streaming || buildDone}
                className="rounded border border-[#7f1d1d] bg-[#450a0a] px-3 py-1 text-xs text-[#fecaca] disabled:opacity-40"
              >
                Stop
              </button>
            </div>
          </div>

          {tabNotice ? (
            <div className="border-b border-[#232323] bg-[#111827] px-4 py-3 text-sm text-[#cbd5e1]">
              {tabNotice}
            </div>
          ) : null}

          <div
            ref={codeContainerRef}
            className={`${jetbrains.className} max-h-[70dvh] overflow-y-auto overflow-x-hidden`}
          >
            {waitingForApp ? (
              <div className="p-4 text-sm leading-7 text-[#9ca3af]">
                App HTML has not started yet. Wait for the landing page to finish first.
              </div>
            ) : !displayForTab ? (
              <div className="p-4 text-sm leading-7 text-[#9ca3af]">
                {streamTab === "landing"
                  ? "Waiting for landing page HTML..."
                  : "Waiting for MVP app HTML..."}
              </div>
            ) : streaming ? (
              /* Use lightweight <pre> during streaming to avoid expensive
                 SyntaxHighlighter re-tokenization on every chunk */
              <pre className="whitespace-pre-wrap break-words p-4 text-[12px] leading-[1.6] text-[#e5e7eb]" style={{ background: "#0d0d0d" }}>
                {displayForTab}
              </pre>
            ) : oneDark ? (
              <SyntaxHighlighter
                language="markup"
                style={oneDark}
                customStyle={{
                  margin: 0,
                  padding: 16,
                  fontSize: 12,
                  lineHeight: 1.6,
                  background: "#0d0d0d",
                  whiteSpace: "pre-wrap",
                  overflowX: "hidden",
                  wordBreak: "break-word",
                }}
                showLineNumbers
                wrapLongLines
              >
                {displayForTab}
              </SyntaxHighlighter>
            ) : (
              <pre className="whitespace-pre-wrap break-words p-4 text-[12px] leading-[1.6] text-[#e5e7eb]">
                {displayForTab}
              </pre>
            )}
          </div>
        </div>

        {!buildDone && !error && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setForceRebuild(false);
                resetOnNextStreamRef.current = false;
                setAttempt((v) => v + 1);
              }}
              className="pill-button pill-button-secondary"
            >
              Retry
            </button>
            <button
              onClick={() => {
                setForceRebuild(true);
                resetOnNextStreamRef.current = true;
                setAttempt((v) => v + 1);
              }}
              className="pill-button pill-button-secondary"
            >
              Force rebuild
            </button>
          </div>
        )}

        {(buildDone || landingHtml || appHtml) && (
          <section className="mt-6">
            <h2 className="mb-3 text-[18px] font-bold text-[var(--color-text-primary)]">
              Preview
            </h2>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode("landing")}
                className={previewMode === "landing" ? "pill-button pill-button-primary" : "pill-button pill-button-secondary"}
              >
                Landing
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("app")}
                className={previewMode === "app" ? "pill-button pill-button-primary" : "pill-button pill-button-secondary"}
              >
                MVP app
              </button>
            </div>

            <div className="panel overflow-hidden">
              {previewMode === "app" && buildPhase === "landing" ? (
                <div className="flex min-h-[320px] items-center justify-center p-6 text-center">
                  <p className="max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
                    Landing page is still generating. Wait for it to finish before opening the MVP app preview.
                  </p>
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  sandbox="allow-scripts"
                  className="h-[70dvh] min-h-[420px] w-full border-none"
                  title="build-preview"
                />
              ) : (
                <div className="p-6 text-sm text-[var(--color-text-secondary)]">
                  Preview will appear here once HTML is available.
                </div>
              )}
            </div>
          </section>
        )}

        {buildDone && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push(`/app/${slug || ideaId}`)}
              className="pill-button pill-button-primary"
            >
              Open landing / MVP viewer
            </button>
            <button
              onClick={() => router.push("/arena")}
              className="pill-button pill-button-secondary"
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
