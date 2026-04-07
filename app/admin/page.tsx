"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  clearStoredAdminToken,
  getStoredAdminToken,
  setStoredAdminToken,
} from "@/lib/admin-client";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const existing = getStoredAdminToken();
    setToken(existing);
    setIsAdmin(Boolean(existing));
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) return;

    setBusy(true);
    try {
      const trimmed = token.trim();
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": trimmed,
        },
        body: JSON.stringify({ action: "ping" }),
      });

      if (!res.ok) {
        clearStoredAdminToken();
        setIsAdmin(false);
        setNotice("Admin token was rejected.");
        return;
      }

      setStoredAdminToken(trimmed);
      setIsAdmin(true);
      setNotice("Admin mode enabled on this browser.");
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getStoredAdminToken(),
        },
        body: JSON.stringify({ action: "resetDemo" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not reset demo data.");
        return;
      }

      setNotice("Demo data reset. Fresh ideas loaded.");
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearStoredAdminToken();
    setToken("");
    setIsAdmin(false);
    setNotice("Admin mode cleared from this browser.");
  };

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
        <div className="mx-auto max-w-[720px]">
          <p className="eyebrow">Admin</p>
          <h1 className="balance mt-4 text-[40px] font-extrabold leading-none text-[var(--color-text-primary)] sm:text-[44px]">
            Demo controls
          </h1>
          <p className="pretty mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
            This page enables demo moderation on this browser only.
          </p>

          {notice ? (
            <div className="panel mt-4 p-4 text-sm text-[var(--color-text-secondary)]">
              {notice}
            </div>
          ) : null}

          <form onSubmit={login} className="panel mt-6 p-6">
            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
              Admin token
            </label>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="mt-3 w-full rounded-[23px] border border-[var(--color-border-default)] bg-white px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none"
              placeholder="Enter token"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="submit" disabled={busy} className="pill-button pill-button-primary">
                {isAdmin ? "Refresh admin session" : "Login"}
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={logout}
                  className="pill-button pill-button-secondary"
                >
                  Logout
                </button>
              ) : null}
            </div>
          </form>

          <div className="panel mt-6 p-6">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Actions</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void resetDemo()}
                disabled={!isAdmin || busy}
                className="pill-button pill-button-primary"
              >
                Start over
              </button>
              <Link href="/arena" className="pill-button pill-button-secondary">
                Arena
              </Link>
              <Link href="/leaderboard" className="pill-button pill-button-secondary">
                Leaderboard
              </Link>
              <Link href="/history" className="pill-button pill-button-secondary">
                History
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
