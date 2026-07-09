// Versioned localStorage helpers (§25). Keys carry a version suffix so a future
// account-migration path can read and upgrade older shapes. All access is
// guarded — SSR/private-mode failures degrade to in-memory only.

export const WATCHLIST_KEY = 'pt.watchlist.v1';
export const PORTFOLIO_KEY = 'pt.portfolio.v1';
export const FORMAT_KEY = 'pt.format.v1';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = safeGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  safeSet(key, JSON.stringify(value));
}

export function loadString(key: string): string | null {
  return safeGet(key);
}

export function saveString(key: string, value: string): void {
  safeSet(key, value);
}
