import type { Db } from "./db";

export function getSetting(db: Db, key: string, fallback = ""): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getCollectionWindows(db: Db): string[] {
  try {
    const v = JSON.parse(getSetting(db, "collection_windows", "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
