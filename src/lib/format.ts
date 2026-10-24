import type { Lang } from "./i18n";

/** Stored on a claim whose payment was reversed; the text after it is the admin's reason. */
export const REVERSED_PREFIX = "payment_reversed:";

/** Claim reject reasons as shown to people: the reversal marker becomes a translated sentence. */
export const claimReason = (reason: string, t: (k: "fees.paymentReversed", v: { reason: string }) => string) =>
  reason.startsWith(REVERSED_PREFIX) ? t("fees.paymentReversed", { reason: reason.slice(REVERSED_PREFIX.length) }) : reason;

// Latin digits in every language keeps amounts and dates consistent across English, Marathi and Hindi.
export const localeTag = (lang: Lang) => (lang === "en" ? "en-IN" : `${lang}-IN-u-nu-latn`);

export function money(paise: number, lang: Lang = "en"): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat(localeTag(lang), {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** Plain number for message templates that already include "₹". */
export const rupees = (paise: number, lang: Lang = "en") =>
  new Intl.NumberFormat(localeTag(lang), { maximumFractionDigits: 2 }).format(paise / 100);

const utc = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

export const fmtDate = (date: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat(localeTag(lang), { ...opts, timeZone: "UTC" }).format(utc(date));

export const fmtWeekday = (date: string, lang: Lang) => fmtDate(date, lang, { weekday: "short", day: "numeric", month: "short" });

export const fmtMonth = (month: string, lang: Lang, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat(localeTag(lang), { month: style, year: "numeric", timeZone: "UTC" }).format(utc(`${month}-01`));

export const fmtMonthName = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(localeTag(lang), { month: "long", timeZone: "UTC" }).format(utc(`${month}-01`));

/** "Aug, Sep, Oct 2026" — groups months by year. */
export function fmtMonths(months: string[], lang: Lang): string {
  const byYear = new Map<string, string[]>();
  for (const m of [...months].sort()) {
    const y = m.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), new Intl.DateTimeFormat(localeTag(lang), { month: "short", timeZone: "UTC" }).format(utc(`${m}-01`))]);
  }
  return [...byYear].map(([y, names]) => `${names.join(", ")} ${y}`).join("; ");
}

export const fmtTime = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(localeTag(lang), { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export const fmtDateTime = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(localeTag(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // keep under serverActions.bodySizeLimit in next.config.ts

/** Cloudinary resizes on the fly from the URL: "face" crops square around the face, "wide" caps the width. */
export const photoUrl = (url: string, kind: "face" | "wide") =>
  url.replace("/upload/", kind === "face" ? "/upload/c_fill,g_face,w_160,h_160,f_auto,q_auto/" : "/upload/c_limit,w_1200,f_auto,q_auto/");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => [...p][0] ?? "")
    .join("")
    .toUpperCase();

/** "Today" / "Yesterday" / "5 days ago" for a date or ISO timestamp (Asia/Kolkata). */
export function relDay(dateOrIso: string, today: string, t: (k: "common.today" | "common.yesterday" | "common.daysAgo", v?: Record<string, number>) => string): string {
  const d =
    dateOrIso.length > 10
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateOrIso))
      : dateOrIso;
  const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
  return n <= 0 ? t("common.today") : n === 1 ? t("common.yesterday") : t("common.daysAgo", { n });
}
