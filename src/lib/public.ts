// Owner-confirmed facts for the public page. Empty means "not confirmed yet" and renders as a placeholder.
export const PUBLIC_KEYS = ["tagline", "about", "timings", "address", "mapUrl", "phone", "whatsapp", "trainer", "joining", "since"] as const;
export type PublicKey = (typeof PUBLIC_KEYS)[number];
// Read them with getSite(lang).info (src/lib/site.ts): per language, in the same query as the other settings.
