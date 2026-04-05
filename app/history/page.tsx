"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAllBuiltApps, type BuiltApp } from "@/lib/db";

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

export default function HistoryPage() {
  const [apps, setApps] = useState<BuiltApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllBuiltApps().then((result) => {
      setApps(result);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#F9F9F9" }}>
        <p style={{ color: "#797979" }}>Loading...</p>
      </div>
    );
  }

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
              href="/arena"
              className="text-[14px] font-medium"
              style={{ color: "#000001" }}
            >
              Arena →
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-[900px] mx-auto px-[24px] py-[40px] w-full">
        <h1
          className="text-[44px] font-extrabold leading-tight mb-[8px]"
          style={{ color: "#1B1B1B" }}
        >
          Battle History
        </h1>
        <p className="text-[18px] mb-[40px]" style={{ color: "#797979" }}>
          All apps built by the community and GLM 5.1.
        </p>

        {apps.length === 0 && (
          <div
            className="text-center py-[80px] rounded-[6px] border"
            style={{ borderColor: "#C8CDD1", color: "#797979" }}
          >
            <p className="text-[20px] mb-[16px]">No apps built yet</p>
            <p className="text-[14px] mb-[24px]">
              Go to the Arena to start your first battle.
            </p>
            <Link
              href="/arena"
              className="inline-block px-[24px] py-[10px] rounded-[22px] text-[14px] font-medium"
              style={{ background: "#000001", color: "#fff" }}
            >
              Enter Arena
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
          {apps.map((app) => (
            <Link
              key={app.slug}
              href={`/app/${app.slug}`}
              className="block rounded-[6px] border p-[24px] hover:border-[#000001] transition-colors"
              style={{ borderColor: "#C8CDD1", background: "#fff" }}
            >
              <div className="flex items-start justify-between mb-[8px]">
                <h3
                  className="text-[18px] font-semibold"
                  style={{ color: "#1B1B1B" }}
                >
                  {app.title}
                </h3>
                <span className="text-[12px] shrink-0 ml-[12px]" style={{ color: "#929292" }}>
                  {getTimeAgo(app.builtAt)}
                </span>
              </div>
              {app.reasoning && (
                <p
                  className="text-[13px] leading-relaxed line-clamp-2"
                  style={{ color: "#797979" }}
                >
                  {app.reasoning}
                </p>
              )}
              <div className="mt-[12px] flex items-center gap-[6px]">
                <span
                  className="text-[11px] font-medium px-[8px] py-[2px] rounded-full"
                  style={{ background: "#000001", color: "#fff" }}
                >
                  GLM 5.1
                </span>
                <span className="text-[12px]" style={{ color: "#929292" }}>
                  View & Download →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t py-[20px]" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1200px] mx-auto px-[24px] text-center">
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
            <Link href="/next" style={{ color: "#1B1B1B" }}>
              What's Next
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
