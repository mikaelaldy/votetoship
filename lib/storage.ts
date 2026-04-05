export interface BuiltApp {
  slug: string;
  title: string;
  reasoning: string;
  html: string;
  builtAt: number;
}

const HISTORY_KEY = "vts_app_history";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getAppHistory(): BuiltApp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getApp(slug: string): BuiltApp | null {
  const history = getAppHistory();
  return history.find((app) => app.slug === slug) ?? null;
}

export function saveApp(app: BuiltApp): void {
  try {
    const history = getAppHistory();
    const existing = history.findIndex((a) => a.slug === app.slug);
    if (existing >= 0) {
      app.slug = `${app.slug}-${Date.now()}`;
    }
    history.unshift(app);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}
