import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What's Next - VoteToShip Roadmap",
  description: "Current focus and upcoming milestones for VoteToShip.",
};

const phases = [
  {
    label: "Now",
    status: "live" as const,
    items: [
      "AI idea recommendation feed",
      "Swipe voting UX (X / Love) on desktop + mobile",
      "Build any idea on demand",
      "Live code stream with concise reasoning",
      "Two generated outputs: landing HTML + MVP HTML",
      "Build cache by exact idea ID",
      "History gallery with copy/download in viewer",
      "Supabase persistence",
    ],
  },
  {
    label: "Next",
    status: "planned" as const,
    items: [
      "Queue user-submitted ideas with moderation",
      "Tag and filter history by category",
      "Add remix button to iterate on built MVP",
      "Improve swipe animation and confidence cues",
    ],
  },
  {
    label: "Later",
    status: "exploring" as const,
    items: [
      "Team rooms for collaborative build sessions",
      "Template packs for vertical-specific landing pages",
      "A/B generation mode for two MVP variants",
    ],
  },
];

export default function WhatsNextPage() {
  return (
    <div className="min-h-dvh" style={{ background: "#F9F9F9" }}>
      <nav className="border-b" style={{ borderColor: "#C8CDD1" }}>
        <div className="max-w-[900px] mx-auto px-[24px] py-[16px] flex items-center justify-between">
          <Link href="/" className="font-bold text-[18px]" style={{ color: "#1B1B1B" }}>VoteToShip</Link>
          <Link href="/arena" className="text-[14px]" style={{ color: "#1B1B1B" }}>Arena</Link>
        </div>
      </nav>

      <main className="max-w-[900px] mx-auto px-[24px] py-[44px]">
        <h1 className="text-[44px] font-extrabold" style={{ color: "#1B1B1B" }}>What&apos;s Next</h1>
        <div className="mt-[26px] space-y-[30px]">
          {phases.map((phase) => (
            <section key={phase.label}>
              <h2 className="text-[26px] font-bold" style={{ color: "#1B1B1B" }}>{phase.label}</h2>
              <ul className="mt-[10px] space-y-[8px]">
                {phase.items.map((item) => (
                  <li key={item} className="text-[15px]" style={{ color: phase.status === "exploring" ? "#797979" : "#1B1B1B" }}>
                    • {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
