"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Mode = "landing" | "app";

interface BuiltApp {
  slug: string;
  title: string;
  reasoning: string;
  landing_html: string;
  app_html: string;
  completed_at: string;
}

function timeAgo(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "just now";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function AppPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [app, setApp] = useState<BuiltApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>("landing");

  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        const res = await fetch(`/api/apps/${slug}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setApp(data.app || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const activeHtml = useMemo(() => {
    if (!app) return "";
    return mode === "landing" ? app.landing_html : app.app_html;
  }, [app, mode]);

  const hasRenderableHtml = useMemo(() => activeHtml.trim().length > 0, [activeHtml]);

  const handleCopy = useCallback(async () => {
    if (!activeHtml) return;
    await navigator.clipboard.writeText(activeHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [activeHtml]);

  const handleDownload = useCallback(() => {
    if (!activeHtml || !app) return;
    const blob = new Blob([activeHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${app.slug}-${mode}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeHtml, app, mode]);

  if (loading) return null;

  if (!app) {
    return (
      <div className="app-shell flex items-center justify-center px-4">
        <div className="panel w-full max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">App not found</h1>
          <Link href="/arena" className="pill-button pill-button-secondary mt-4">
            Back to arena
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="text-lg font-bold text-[var(--color-text-primary)]">
            VoteToShip
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/history" className="pill-button pill-button-secondary">
              History
            </Link>
            <Link href="/arena" className="pill-button pill-button-secondary">
              Arena
            </Link>
          </div>
        </div>
      </nav>

      <main className="app-container page-section">
        <p className="eyebrow">Viewer</p>
        <h1 className="balance mt-4 text-[36px] font-extrabold leading-none text-[var(--color-text-primary)] sm:text-[40px]">
          {app.title}
        </h1>
        <p className="pretty mt-3 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)]">
          {app.reasoning}
        </p>
        <p className="mt-3 text-sm tabular-nums text-[var(--color-text-tertiary)]">
          Built {timeAgo(app.completed_at)}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => setMode("landing")}
            className={mode === "landing" ? "pill-button pill-button-primary" : "pill-button pill-button-secondary"}
          >
            Landing Page
          </button>
          <button
            onClick={() => setMode("app")}
            className={mode === "app" ? "pill-button pill-button-primary" : "pill-button pill-button-secondary"}
          >
            MVP App
          </button>
          <button onClick={handleDownload} className="pill-button pill-button-secondary">
            Download HTML
          </button>
          <button
            onClick={handleCopy}
            className={copied ? "pill-button pill-button-primary" : "pill-button pill-button-secondary"}
          >
            {copied ? "Copied" : "Copy HTML"}
          </button>
        </div>

        <div className="panel mt-6 overflow-hidden">
          {hasRenderableHtml ? (
            <iframe
              srcDoc={activeHtml}
              sandbox="allow-scripts"
              className="h-[60dvh] min-h-[480px] w-full border-none md:h-[70dvh]"
              title={`${app.title}-${mode}`}
            />
          ) : (
            <div className="flex min-h-[480px] items-center justify-center p-6">
              <div className="max-w-md text-center">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  This output is empty.
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  The build may have failed before HTML was saved.
                </p>
                <Link
                  href={`/build?ideaId=${encodeURIComponent(slug)}&forceRebuild=1`}
                  className="pill-button pill-button-primary mt-4"
                >
                  Rebuild this idea
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
