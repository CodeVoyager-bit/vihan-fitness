import { db } from "./db";

// Owner-confirmed facts for the public page. Empty means "not confirmed yet" and renders as a placeholder.
export const PUBLIC_KEYS = ["tagline", "about", "timings", "address", "mapUrl", "phone", "whatsapp", "trainer", "joining", "since"] as const;
export type PublicKey = (typeof PUBLIC_KEYS)[number];

export function publicInfo(): Record<PublicKey, string> {
  const rows = db().prepare("SELECT key, value FROM settings WHERE key LIKE 'pub_%'").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key.slice(4), r.value]));
  return Object.fromEntries(PUBLIC_KEYS.map((k) => [k, map.get(k) ?? ""])) as Record<PublicKey, string>;
}
