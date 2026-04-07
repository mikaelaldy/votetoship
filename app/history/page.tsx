"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface BuildRow {
  id: string;
  idea_id: string;
  slug: string;
  title: string;
  status: "building" | "completed" | "failed";
  reasoning: string;
  error_message: string | null;
  updated_at: string;
  completed_at: string | null;
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

export default function HistoryPage() {
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/builds", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setBuilds(data.builds || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { inProgress, failed, completed } = useMemo(() => {
    const inProgress = builds.filter((b) => b.status === "building");
    const failed = builds.filter((b) => b.status === "failed");
    const completed = builds.filter((b) => b.status === "completed");
    return { inProgress, failed, completed };
  }, [builds]);

  if (loading) return null;

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="text-lg font-bold text-[var(--color-text-primary)]">
            VoteToShip
          </Link>
          <Link href="/arena" className="pill-button pill-button-secondary">
            Arena
          </Link>
        </div>
      </nav>

      <main className="app-container page-section">
        <p className="eyebrow">Build archive</p>
        <h1 className="balance mt-4 text-[40px] font-extrabold leading-none text-[var(--color-text-primary)] sm:text-[44px]">
          Builds
        </h1>
        <p className="pretty mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
          See what is generating now, what failed, and finished apps you can open.
        </p>

        {inProgress.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">In progress</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {inProgress.map((b) => (
                <Link
                  key={b.id}
                  href={`/build?ideaId=${encodeURIComponent(b.idea_id)}`}
                  className="panel block border-amber-300 bg-amber-50 p-5"
                >
                  <p className="eyebrow text-amber-700">Generating</p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    {b.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                    Updated {timeAgo(b.updated_at)}. Open to watch the stream.
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {failed.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Failed</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {failed.map((b) => (
                <div key={b.id} className="panel border-red-200 p-5">
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {b.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-red-700">
                    {b.error_message || "Build failed"}
                  </p>
                  <Link
                    href={`/build?ideaId=${encodeURIComponent(b.idea_id)}&forceRebuild=1`}
                    className="pill-button pill-button-secondary mt-4"
                  >
                    Retry build
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Finished</h2>
          {completed.length === 0 ? (
            <div className="panel mt-4 p-6">
              <p className="text-[var(--color-text-secondary)]">No completed builds yet.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {completed.map((app) => (
                <Link key={app.id} href={`/app/${app.slug}`} className="panel block p-5">
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {app.title}
                  </h3>
                  <p className="pretty mt-3 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                    {app.reasoning}
                  </p>
                  <p className="mt-4 text-sm tabular-nums text-[var(--color-text-tertiary)]">
                    {app.completed_at ? timeAgo(app.completed_at) : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
