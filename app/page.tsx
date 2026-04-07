import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VoteToShip - Swipe, Vote, Build",
  description:
    "AI recommends app ideas. Users swipe X or Love. Any idea can be built into landing + MVP and cached.",
};

export default function LandingPage() {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1100px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <span className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>
            VoteToShip
          </span>
          <Link href="/arena" className="text-[14px] font-medium" style={{ color: "#000001" }}>
            Enter Arena
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-[24px] py-[70px]">
        <h1 className="text-[50px] font-extrabold leading-tight" style={{ color: "#1B1B1B" }}>
          Swipe ideas.
          <br />
          Build any one.
        </h1>
        <p className="text-[22px] mt-[14px] max-w-[720px]" style={{ color: "#797979" }}>
          GLM recommends ideas. Community swipes X or Love. Any idea can be built into two separate outputs: a landing page and an MVP app.
        </p>

        <div className="mt-[28px] flex items-center gap-[12px]">
          <Link
            href="/arena"
            className="px-[24px] py-[11px] rounded-[22px] text-[15px] font-semibold"
            style={{ background: "#000001", color: "#fff" }}
          >
            Start Swiping
          </Link>
          <Link
            href="/leaderboard"
            className="px-[24px] py-[11px] rounded-[22px] text-[15px] font-semibold border"
            style={{ borderColor: "#C8CDD1", color: "#1B1B1B" }}
          >
            Live Leaderboard
          </Link>
          <Link
            href="/history"
            className="px-[24px] py-[11px] rounded-[22px] text-[15px] font-semibold border"
            style={{ borderColor: "#C8CDD1", color: "#1B1B1B" }}
          >
            View History
          </Link>
        </div>

        <div className="mt-[44px] grid grid-cols-1 md:grid-cols-3 gap-[14px]">
          {[
            ["Swipe voting", "Desktop and mobile both use swipe-driven X or Love voting."],
            ["Build any time", "Every idea has Build. Users can start build immediately."],
            ["Cached outputs", "If already built, users join existing stream/result instead of rebuilding."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-[8px] border p-[16px]" style={{ borderColor: "#C8CDD1", background: "#fff" }}>
              <h3 className="text-[18px] font-semibold" style={{ color: "#1B1B1B" }}>{title}</h3>
              <p className="text-[14px] mt-[6px]" style={{ color: "#797979" }}>{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
