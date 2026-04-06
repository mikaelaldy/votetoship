"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BuildItem {
  slug: string;
  title: string;
  reasoning: string;
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

export default function HistoryPage() {
  const [apps, setApps] = useState<BuildItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setApps(data.history || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
          Build History
        </h1>
        <p className="text-[16px] mt-[4px]" style={{ color: "#797979" }}>
          Cached builds. If an idea already exists, users join that result instead of regenerating.
        </p>

        {apps.length === 0 ? (
          <div className="mt-[22px] rounded-[8px] border p-[20px]" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
            <p style={{ color: "#797979" }}>No builds yet.</p>
          </div>
        ) : (
          <div className="mt-[18px] grid grid-cols-1 md:grid-cols-2 gap-[12px]">
            {apps.map((app) => (
              <Link key={app.slug} href={`/app/${app.slug}`} className="rounded-[8px] border p-[16px] block" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
                <h3 className="text-[18px] font-semibold" style={{ color: "#1B1B1B" }}>
                  {app.title}
                </h3>
                <p className="text-[13px] mt-[6px] line-clamp-2" style={{ color: "#797979" }}>
                  {app.reasoning}
                </p>
                <p className="text-[12px] mt-[8px]" style={{ color: "#929292" }}>
                  {timeAgo(app.completed_at)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
