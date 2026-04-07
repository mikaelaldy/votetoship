import type { SVGProps } from "react";
import Link from "next/link";

function IconSwipe(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M7 12h10M7 12l3-3M7 12l3 3" />
      <rect x={3} y={5} width={18} height={14} rx={2} />
    </svg>
  );
}

function IconTrophy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 01-10 0V4z" />
      <path d="M7 7H5a2 2 0 00-2 2v1a4 4 0 004 4M17 7h2a2 2 0 012 2v1a4 4 0 01-4 4" />
    </svg>
  );
}

function IconSpark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-container flex flex-wrap items-center justify-between gap-4 py-4">
          <Link
            href="/"
            className="cursor-pointer text-lg font-bold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
          >
            VoteToShip
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/leaderboard"
              className="pill-button pill-button-secondary cursor-pointer"
            >
              Leaderboard
            </Link>
            <Link
              href="/history"
              className="pill-button pill-button-secondary cursor-pointer"
            >
              History
            </Link>
            <Link
              href="/arena"
              className="pill-button pill-button-primary cursor-pointer"
            >
              Enter arena
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="app-container page-section pb-12 pt-8 sm:pb-16 sm:pt-12">
          <div className="mx-auto max-w-[760px] text-center">
            <p className="eyebrow">Community-driven builds</p>
            <h1 className="balance mt-4 text-balance text-[40px] font-extrabold leading-[1.05] text-[var(--color-text-primary)] sm:text-[48px] lg:text-[52px]">
              Vote on ideas. Ship the winner.
            </h1>
            <p className="pretty mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
              Swipe through web app concepts, push the best ones up the leaderboard, and watch the top pick get built live with GLM&nbsp;5.1.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/arena"
                className="pill-button pill-button-primary min-h-[44px] cursor-pointer px-6 text-[15px]"
              >
                Start voting
              </Link>
              <Link
                href="/leaderboard"
                className="pill-button pill-button-secondary min-h-[44px] cursor-pointer px-6 text-[15px]"
              >
                See the leaderboard
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-border-default)] bg-[color-mix(in_srgb,white_92%,var(--color-surface-base))] py-14 sm:py-20">
          <div className="app-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
                How it works
              </h2>
              <p className="pretty mt-3 text-base leading-7 text-[var(--color-text-secondary)]">
                Three steps from idea to momentum—no account required to try the arena.
              </p>
            </div>
            <ul className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-3">
              <li className="panel flex flex-col p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-white text-[var(--color-accent)]">
                  <IconSwipe className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
                  Swipe in the arena
                </h3>
                <p className="pretty mt-2 text-sm leading-6 text-[var(--color-text-secondary)] sm:text-[15px] sm:leading-7">
                  Love what you would use; pass on what you would not. Your votes update the live tally instantly.
                </p>
              </li>
              <li className="panel flex flex-col p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-white text-[var(--color-accent)]">
                  <IconTrophy className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
                  Rankings stay honest
                </h3>
                <p className="pretty mt-2 text-sm leading-6 text-[var(--color-text-secondary)] sm:text-[15px] sm:leading-7">
                  The leaderboard reflects real preferences so the crowd favorite is always visible.
                </p>
              </li>
              <li className="panel flex flex-col p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-white text-[var(--color-accent)]">
                  <IconSpark className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
                  Ship with GLM&nbsp;5.1
                </h3>
                <p className="pretty mt-2 text-sm leading-6 text-[var(--color-text-secondary)] sm:text-[15px] sm:leading-7">
                  The winning direction gets built in the open—follow build history to see what shipped.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section className="app-container page-section py-14 sm:py-16">
          <div className="panel mx-auto flex max-w-4xl flex-col items-start gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-10">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">
                Ready to pick what ships next?
              </h2>
              <p className="pretty mt-2 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">
                Jump into the arena or browse past builds—every vote nudges the roadmap.
              </p>
            </div>
            <Link
              href="/arena"
              className="pill-button pill-button-primary min-h-[44px] shrink-0 cursor-pointer px-8 text-[15px]"
            >
              Open the arena
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border-default)]">
        <div className="app-container flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-[var(--color-text-secondary)]">
          <div className="flex flex-wrap items-center gap-4">
            <span>VoteToShip — ideas to production.</span>
            <a
              href="https://mikacend.xyz"
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer transition-colors hover:text-[var(--color-text-primary)]"
            >
              made by mikacend
            </a>
            <a
              href="https://twitter.com/mikaelbuilds"
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer transition-colors hover:text-[var(--color-text-primary)]"
            >
              @mikaelbuilds
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/leaderboard"
              className="cursor-pointer transition-colors hover:text-[var(--color-text-primary)]"
            >
              Live leaderboard
            </Link>
            <Link
              href="/history"
              className="cursor-pointer transition-colors hover:text-[var(--color-text-primary)]"
            >
              Build history
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
