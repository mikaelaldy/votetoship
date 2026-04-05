import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What's Next — VoteToShip Roadmap",
  description:
    "Planned features and roadmap for VoteToShip — the community-driven app builder powered by GLM 5.1.",
};

const phases = [
  {
    label: "Now",
    status: "live" as const,
    items: [
      "Auto-generate web app ideas via GLM 5.1",
      "Community voting with live leaderboard",
      "Auto-build winner with real-time code streaming",
      "Live preview of generated apps",
      "Copy generated code with one click",
      "Auto-loop: continuous battle arena",
    ],
  },
  {
    label: "Next",
    status: "planned" as const,
    items: [
      "User-submitted ideas — suggest your own app for the arena",
      "Battle history — gallery of all past winners",
      "Email reminders — get notified when a new battle starts",
      "Countdown timer — scheduled battles with visible countdown",
      "Social sharing — one-click post the built app to X",
      "Persisted leaderboard — track wins across sessions",
    ],
  },
  {
    label: "Later",
    status: "exploring" as const,
    items: [
      "Multi-player voting — real-time vote sync across users via WebSockets",
      "GLM improves past winners — iterate on previously built apps",
      "App marketplace — browse and fork all generated apps",
      "Custom themes — choose dark/light for generated apps",
      "Tournament mode — bracket-style elimination rounds",
      "API access — programmatic access to idea generation and building",
    ],
  },
];

const statusStyles = {
  live: { bg: "#000001", color: "#fff", label: "Live" },
  planned: { bg: "#f9f9f9", color: "#1B1B1B", label: "Planned" },
  exploring: { bg: "#f9f9f9", color: "#797979", label: "Exploring" },
};

export default function WhatsNextPage() {
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
            Enter Arena →
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-[720px] mx-auto px-[24px] py-[60px] w-full">
        <h1
          className="text-[44px] font-extrabold leading-tight mb-[8px]"
          style={{ color: "#1B1B1B" }}
        >
          What's Next
        </h1>
        <p
          className="text-[18px] mb-[48px]"
          style={{ color: "#797979" }}
        >
          VoteToShip roadmap — where we are and where we're going.
        </p>

        <div className="space-y-[40px]">
          {phases.map((phase) => {
            const style = statusStyles[phase.status];
            return (
              <div key={phase.label}>
                <div className="flex items-center gap-[12px] mb-[16px]">
                  <h2
                    className="text-[24px] font-bold"
                    style={{ color: "#1B1B1B" }}
                  >
                    {phase.label}
                  </h2>
                  <span
                    className="text-[11px] font-bold px-[10px] py-[3px] rounded-full"
                    style={{
                      background: style.bg,
                      color: style.color,
                      border:
                        phase.status !== "live"
                          ? "1px solid #C8CDD1"
                          : "none",
                    }}
                  >
                    {style.label}
                  </span>
                </div>
                <ul className="space-y-[10px]">
                  {phase.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-[10px] text-[15px] leading-relaxed"
                      style={{
                        color:
                          phase.status === "exploring"
                            ? "#797979"
                            : "#1B1B1B",
                      }}
                    >
                      <span
                        className="mt-[6px] shrink-0 w-[6px] h-[6px] rounded-full"
                        style={{
                          background:
                            phase.status === "live"
                              ? "#000001"
                              : "#C8CDD1",
                        }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t py-[24px]" style={{ borderColor: "#C8CDD1" }}>
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
            <Link href="/history" style={{ color: "#1B1B1B" }}>
              History
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
