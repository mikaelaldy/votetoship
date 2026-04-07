import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VoteToShip - Swipe, Vote, Build",
  description:
    "AI recommends app ideas. Users swipe X or Love. Any idea can be built into landing + MVP and cached.",
};

export default function LandingPage() {
  return (
    <div className="app-shell flex flex-col">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <span className="text-lg font-bold text-[var(--color-text-primary)]">
            VoteToShip
          </span>
          <Link href="/arena" className="pill-button pill-button-secondary">
            Enter Arena
          </Link>
        </div>
      </nav>

      <main className="app-container page-section flex-1">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section className="max-w-3xl">
            <p className="eyebrow">Ship the ideas with signal</p>
            <h1 className="balance mt-4 text-5xl font-extrabold leading-none tracking-tight text-[var(--color-text-primary)] sm:text-[56px]">
              Swipe ideas.
              <br />
              Build any one.
            </h1>
            <p className="pretty mt-4 max-w-2xl text-lg font-medium leading-8 text-[var(--color-text-secondary)] sm:text-2xl sm:leading-9">
              GLM recommends ideas. Community swipes X or Love. Any idea can be built into two separate outputs: a landing page and an MVP app.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/arena" className="pill-button pill-button-primary">
                Start Swiping
              </Link>
              <Link href="/leaderboard" className="pill-button pill-button-secondary">
                Live Leaderboard
              </Link>
              <Link href="/history" className="pill-button pill-button-secondary">
                View History
              </Link>
            </div>
          </section>

          <aside className="panel p-6">
            <p className="eyebrow">How it works</p>
            <div className="mt-4 space-y-4">
              {[
                ["Swipe voting", "Desktop and mobile both use swipe-driven X or Love voting."],
                ["Build any time", "Every idea has Build. Users can start build immediately."],
                ["Cached outputs", "If already built, users join existing stream/result instead of rebuilding."],
              ].map(([title, desc], index) => (
                <div
                  key={title}
                  className="rounded-[23px] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-4"
                >
                  <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    0{index + 1}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    {title}
                  </h3>
                  <p className="pretty mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Fresh battle", "A clean batch of ideas keeps the arena moving instead of stalling on dead cards."],
            ["Live rank", "Votes update in real time so the leaderboard stays useful while the room is swiping."],
            ["Build archive", "Finished builds stay browsable, downloadable, and reusable without rerunning the model."],
          ].map(([title, desc]) => (
            <div key={title} className="panel p-5">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
              <p className="pretty mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
