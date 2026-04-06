"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface BuiltApp {
  slug: string;
  title: string;
  reasoning: string;
  html: string;
  builtAt: number;
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AppPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [app, setApp] = useState<BuiltApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`/api/apps/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setApp(data.app);
        }
      } catch {}
      setLoading(false);
    })();
  }, [slug]);

  const handleCopy = useCallback(async () => {
    if (!app) return;
    await navigator.clipboard.writeText(app.html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [app]);

  const handleDownload = useCallback(() => {
    if (!app) return;
    const blob = new Blob([app.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${app.slug}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [app]);

  if (loading) return null;

  if (!app) {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#F9F9F9" }}>
        <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
          <div className="max-w-[1200px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
            <Link
              href="/"
              className="font-bold text-[18px]"
              style={{ color: "#1B1B1B" }}
            >
              VoteToShip
            </Link>
            <Link
              href="/arena"
              className="text-[14px] font-medium"
              style={{ color: "#000001" }}
            >
              Enter Arena â†’
            </Link>
          </div>
        </nav>
        <main className="flex-1 flex items-center justify-center px-[24px]">
          <div className="text-center">
            <h1
              className="text-[24px] font-bold mb-[12px]"
              style={{ color: "#1B1B1B" }}
            >
              App not found
            </h1>
            <p className="text-[14px] mb-[20px]" style={{ color: "#797979" }}>
              This app may not exist or hasn&apos;t been built yet.
            </p>
            <Link
              href="/arena"
              className="inline-block px-[24px] py-[10px] rounded-[22px] text-[14px] font-medium"
              style={{ background: "#000001", color: "#fff" }}
            >
              Go to Arena
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const timeAgo = getTimeAgo(app.builtAt);

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1200px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link
            href="/"
            className="font-bold text-[18px]"
            style={{ color: "#1B1B1B" }}
          >
            VoteToShip
          </Link>
          <div className="flex items-center gap-[16px]">
            <Link
              href="/history"
              className="text-[14px] font-medium"
              style={{ color: "#797979" }}
            >
              History
            </Link>
            <Link
              href="/arena"
              className="text-[14px] font-medium"
              style={{ color: "#000001" }}
            >
              Arena â†’
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-[1000px] mx-auto px-[24px] py-[40px] w-full">
        <div className="mb-[20px]">
          <h1
            className="text-[32px] font-extrabold mb-[4px]"
            style={{ color: "#1B1B1B" }}
          >
            {app.title}
          </h1>
          <div className="flex items-center gap-[12px]">
            {app.reasoning && (
              <p className="text-[14px]" style={{ color: "#797979" }}>
                {app.reasoning}
              </p>
            )}
            <span className="text-[13px]" style={{ color: "#929292" }}>
              Built {timeAgo}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-[10px] mb-[12px]">
          <button
            onClick={handleDownload}
            className="px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium cursor-pointer"
            style={{ background: "#000001", color: "#fff" }}
          >
            Download .html
          </button>
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
          <Link
            href="/arena?reset=1"
            className="px-[20px] py-[10px] rounded-[22px] text-[14px] font-medium border"
            style={{
              borderColor: "#C8CDD1",
              color: "#1B1B1B",
              background: "transparent",
            }}
          >
            New Battle
          </Link>
        </div>

        <div
          className="rounded-[6px] border overflow-hidden"
          style={{ borderColor: "#C8CDD1", background: "#fff" }}
        >
          <iframe
            srcDoc={app.html}
            sandbox="allow-scripts"
            className="w-full border-none"
            style={{ height: "600px" }}
            title={app.title}
          />
        </div>
      </main>

      <footer className="border-t py-[20px]" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1200px] mx-auto px-[24px] text-center">
          <p className="text-[13px]" style={{ color: "#797979" }}>
            Built for the Build with GLM 5.1 Challenge Â· Powered by GLM 5.1 Â·{" "}
            <a
              href="https://mikacend.xyz"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1B1B1B" }}
            >
              mikacend
            </a>
            {" Â· "}
            <Link href="/next" style={{ color: "#1B1B1B" }}>
              What&apos;s Next
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

