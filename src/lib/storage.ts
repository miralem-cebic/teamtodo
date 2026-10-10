// Keys from before the rename to teamtodo are migrated on first read, so that existing
// installations keep their settings. Storage can be unavailable (private windows, blocked site data).

export function readStorage(key: string, legacyKey: string): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(legacyKey);
    }
    return legacy;
  } catch {
    return null;
  }
}
