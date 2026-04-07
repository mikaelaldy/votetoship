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
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1000px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </Link>
          <Link href="/arena" className="text-[14px]" style={{ color: "#1B1B1B" }}>
            Arena
          </Link>
        </div>
      </nav>

      <main className="max-w-[1000px] mx-auto px-[24px] py-[34px]">
        <h1 className="text-[40px] font-extrabold" style={{ color: "#1B1B1B" }}>
          Builds
        </h1>
        <p className="text-[16px] mt-[4px]" style={{ color: "#797979" }}>
          See what is generating now, what failed, and finished apps you can open.
        </p>

        {inProgress.length > 0 ? (
          <section className="mt-[28px]">
            <h2 className="text-[18px] font-bold" style={{ color: "#1B1B1B" }}>
              In progress
            </h2>
            <div className="mt-[12px] grid grid-cols-1 md:grid-cols-2 gap-[12px]">
              {inProgress.map((b) => (
                <Link
                  key={b.id}
                  href={`/build?ideaId=${encodeURIComponent(b.idea_id)}`}
                  className="rounded-[8px] border p-[16px] block"
                  style={{ borderColor: "#ca8a04", background: "#fffbeb" }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#a16207" }}>
                    Generating
                  </p>
                  <h3 className="text-[18px] font-semibold mt-[4px]" style={{ color: "#1B1B1B" }}>
                    {b.title}
                  </h3>
                  <p className="text-[12px] mt-[8px]" style={{ color: "#797979" }}>
                    Updated {timeAgo(b.updated_at)} · open to watch the stream
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {failed.length > 0 ? (
          <section className="mt-[28px]">
            <h2 className="text-[18px] font-bold" style={{ color: "#1B1B1B" }}>
              Failed
            </h2>
            <div className="mt-[12px] grid grid-cols-1 md:grid-cols-2 gap-[12px]">
              {failed.map((b) => (
                <div
                  key={b.id}
                  className="rounded-[8px] border p-[16px]"
                  style={{ borderColor: "#fecaca", background: "#fff" }}
                >
                  <h3 className="text-[18px] font-semibold" style={{ color: "#1B1B1B" }}>
                    {b.title}
                  </h3>
                  <p className="text-[13px] mt-[6px]" style={{ color: "#b91c1c" }}>
                    {b.error_message || "Build failed"}
                  </p>
                  <Link
                    href={`/build?ideaId=${encodeURIComponent(b.idea_id)}&forceRebuild=1`}
                    className="inline-block mt-[10px] text-[13px] underline"
                    style={{ color: "#1B1B1B" }}
                  >
                    Retry build
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-[28px]">
          <h2 className="text-[18px] font-bold" style={{ color: "#1B1B1B" }}>
            Finished
          </h2>
          {completed.length === 0 ? (
            <div className="mt-[12px] rounded-[8px] border p-[20px]" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
              <p style={{ color: "#797979" }}>No completed builds yet.</p>
            </div>
          ) : (
            <div className="mt-[12px] grid grid-cols-1 md:grid-cols-2 gap-[12px]">
              {completed.map((app) => (
                <Link
                  key={app.id}
                  href={`/app/${app.slug}`}
                  className="rounded-[8px] border p-[16px] block"
                  style={{ borderColor: "#C8CDD1", background: "#fff" }}
                >
                  <h3 className="text-[18px] font-semibold" style={{ color: "#1B1B1B" }}>
                    {app.title}
                  </h3>
                  <p className="text-[13px] mt-[6px] line-clamp-2" style={{ color: "#797979" }}>
                    {app.reasoning}
                  </p>
                  <p className="text-[12px] mt-[8px]" style={{ color: "#929292" }}>
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
