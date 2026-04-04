import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VoteToShip — Vote on web app ideas, GLM 5.1 builds the winner",
  description:
    "Community votes on web app ideas. The highest-voted idea gets automatically built live as an interactive web app by GLM 5.1.",
};

export default function LandingPage() {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[1200px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <span
            className="font-bold text-[18px]"
            style={{ color: "#1B1B1B" }}
          >
            VoteToShip
          </span>
          <Link
            href="/arena"
            className="text-[14px] font-medium"
            style={{ color: "#000001" }}
          >
            Enter Arena →
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-[24px] py-[92px]">
        <div className="max-w-[720px] text-center">
          <h1
            className="text-[44px] font-extrabold leading-tight text-balance"
            style={{ color: "#1B1B1B" }}
          >
            Vote on web app ideas.
            <br />
            The winner gets built live.
          </h1>
          <p
            className="text-[24px] font-medium mt-[20px] mb-[40px] text-pretty leading-relaxed"
            style={{ color: "#797979" }}
          >
            Community votes decide which idea to build. GLM 5.1 analyzes the
            votes and ships a fully interactive web app in seconds.
          </p>
          <Link
            href="/arena"
            className="inline-block px-[40px] py-[14px] rounded-[22px] text-[16px] font-semibold"
            style={{ background: "#000001", color: "#fff" }}
          >
            Enter the Arena
          </Link>
        </div>

        <div className="max-w-[720px] mt-[92px] grid grid-cols-1 md:grid-cols-3 gap-[24px] w-full">
          {[
            {
              step: "01",
              title: "Vote",
              desc: "Browse fresh web app ideas. Upvote the ones you love, downvote the rest.",
            },
            {
              step: "02",
              title: "GLM Builds",
              desc: "GLM 5.1 analyzes votes, picks the winner, and generates a complete web app.",
            },
            {
              step: "03",
              title: "Play & Ship",
              desc: "Interact with the live app instantly. Copy the code and make it yours.",
            },
          ].map((item) => (
            <div key={item.step}>
              <span
                className="text-[44px] font-extrabold leading-none"
                style={{ color: "#C8CDD1" }}
              >
                {item.step}
              </span>
              <h3
                className="text-[20px] font-semibold mt-[6px] mb-[6px]"
                style={{ color: "#1B1B1B" }}
              >
                {item.title}
              </h3>
              <p
                className="text-[14px] leading-relaxed"
                style={{ color: "#797979" }}
              >
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer
        className="border-t py-[24px]"
        style={{ borderColor: "#C8CDD1" }}
      >
        <div className="max-w-[1200px] mx-auto px-[24px] text-center">
          <p className="text-[13px]" style={{ color: "#797979" }}>
            Built for the Build with GLM 5.1 Challenge · Powered by GLM 5.1
          </p>
        </div>
      </footer>
    </div>
  );
}
