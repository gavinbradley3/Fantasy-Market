// Storage adapter boundary. All persistence flows through StorageLike so the
// migration/validation layer is testable without a browser, and so storage
// failures (quota, disabled, private mode) degrade to in-memory state instead
// of crashing the app.
//
// NOTE: there is deliberately NO generic `loadJSON<T>` here anymore — the old
// `JSON.parse(raw) as T` unchecked cast was how corrupt persisted data walked
// straight into application state. Reads go through the schema-validating
// loaders in migrations.ts.

export interface StorageLike {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserStorage: StorageLike = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      // Quota/disabled storage: state lives on in memory for this session.
      if (import.meta.env.DEV) console.warn(`[storage] write failed for ${key}`, err);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** In-memory adapter for tests and storage-less environments. */
export function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}
