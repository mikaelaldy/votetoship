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
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#F9F9F9" }}>
        <div className="text-center">
          <h1 className="text-[24px] font-bold" style={{ color: "#1B1B1B" }}>App not found</h1>
          <Link href="/arena" className="underline text-[14px]" style={{ color: "#797979" }}>
            Back to arena
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1100px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </Link>
          <div className="flex items-center gap-[14px]">
            <Link href="/history" className="text-[14px]" style={{ color: "#797979" }}>History</Link>
            <Link href="/arena" className="text-[14px]" style={{ color: "#1B1B1B" }}>Arena</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-[1100px] mx-auto px-[24px] py-[28px]">
        <h1 className="text-[32px] font-extrabold" style={{ color: "#1B1B1B" }}>{app.title}</h1>
        <p className="text-[14px] mt-[6px]" style={{ color: "#797979" }}>{app.reasoning}</p>
        <p className="text-[12px] mt-[4px]" style={{ color: "#929292" }}>Built {timeAgo(app.completed_at)}</p>

        <div className="mt-[14px] flex items-center gap-[10px]">
          <button
            onClick={() => setMode("landing")}
            className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
            style={{ background: mode === "landing" ? "#000001" : "#fff", color: mode === "landing" ? "#fff" : "#1B1B1B", border: "1px solid #C8CDD1" }}
          >
            Landing Page
          </button>
          <button
            onClick={() => setMode("app")}
            className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
            style={{ background: mode === "app" ? "#000001" : "#fff", color: mode === "app" ? "#fff" : "#1B1B1B", border: "1px solid #C8CDD1" }}
          >
            MVP App
          </button>
          <button
            onClick={handleDownload}
            className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
            style={{ background: "#000001", color: "#fff" }}
          >
            Download HTML
          </button>
          <button
            onClick={handleCopy}
            className="px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold border"
            style={{ borderColor: "#C8CDD1", background: copied ? "#000001" : "#fff", color: copied ? "#fff" : "#1B1B1B" }}
          >
            {copied ? "Copied" : "Copy HTML"}
          </button>
        </div>

        <div className="mt-[14px] rounded-[10px] border overflow-hidden" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
          {hasRenderableHtml ? (
            <iframe
              srcDoc={activeHtml}
              sandbox="allow-scripts"
              className="w-full border-none"
              style={{ height: "680px" }}
              title={`${app.title}-${mode}`}
            />
          ) : (
            <div className="h-[680px] flex items-center justify-center p-[20px]">
              <div className="text-center">
                <p className="text-[15px] font-semibold" style={{ color: "#1B1B1B" }}>
                  This output is empty.
                </p>
                <p className="text-[13px] mt-[6px]" style={{ color: "#797979" }}>
                  The build may have failed before HTML was saved.
                </p>
                <Link
                  href={`/build?ideaId=${encodeURIComponent(slug)}&forceRebuild=1`}
                  className="inline-block mt-[12px] px-[14px] py-[8px] rounded-[18px] text-[13px] font-semibold"
                  style={{ background: "#000001", color: "#fff" }}
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
