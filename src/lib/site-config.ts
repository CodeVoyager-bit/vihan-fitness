// What the owner can change from Admin → More. Defaults are today's values, so nothing changes until he
// edits something. Shared by the server (reading, validation) and the admin forms (inputs, labels).
import { type Lang, type TKey, DICTS, lookup } from "./i18n";

/** Accent presets. Each keeps dark ink readable on the accent and `ink` readable on light surfaces (checked in tests). */
export const ACCENTS = {
  lime: { volt: "#c8f23c", soft: "#eefbc4", strong: "#b4e01f", ink: "#445c00", deep: "#3d4d0f", night: "#1d2112" },
  amber: { volt: "#ffc53d", soft: "#fff1cc", strong: "#f5b100", ink: "#6b4500", deep: "#4d3a0f", night: "#211c12" },
  aqua: { volt: "#53e3dc", soft: "#d4f8f6", strong: "#2fd1c9", ink: "#005c58", deep: "#0f4a47", night: "#122120" },
  coral: { volt: "#ff9a5a", soft: "#ffe3d1", strong: "#ff7f33", ink: "#7a3000", deep: "#4d260f", night: "#21160f" },
  rose: { volt: "#ff8fc8", soft: "#ffe0ef", strong: "#ff6fb5", ink: "#8a1257", deep: "#4d0f30", night: "#21121a" },
};
export type AccentKey = keyof typeof ACCENTS;
export type Accent = (typeof ACCENTS)[AccentKey];

export const HERO_BGS = ["blinds", "pixel", "silk", "chrome", "lines"] as const;
export const PAY_METHODS = ["cash", "upi", "other"] as const;
export const SOCIALS = ["instagram", "facebook", "youtube", "reviews"] as const;
export const SHOWABLE = ["about", "membership", "app", "trainer", "gallery", "visit"] as const;
export type Showable = (typeof SHOWABLE)[number];

/** Filled into every text automatically, e.g. "Ask {owner}". Owners rename the gym once, every text follows. */
export const BRAND_VARS = ["gym", "gymShort", "owner", "ownerName", "town"] as const;

/** First-week checklist item. Built-in keys keep their translated label unless the owner writes one. */
export type ChecklistItem = { key: string; label: Partial<Record<Lang, string>> };
export const BUILTIN_CHECKLIST = ["meet", "goals", "equipment", "routine", "firstWeek"] as const;

/** A checklist item's label: the owner's text in this language, else his English, else the standard wording. */
export function checklistLabel(item: ChecklistItem, lang: Lang, t: (key: TKey) => string): string {
  return item.label[lang] || item.label.en || ((BUILTIN_CHECKLIST as readonly string[]).includes(item.key) ? t(`member.onboardingItems.${item.key}` as TKey) : item.key);
}

type ByLang = Record<Lang, string>;
const l3 = (en: string, mr = en, hi = mr): ByLang => ({ en, mr, hi });

export type FieldType = "text" | "longtext" | "url" | "phone" | "int" | "intList" | "select" | "multi" | "upi" | "items";
export type SiteField = {
  /** Storage key. Per-language fields keep English under this key and add `.mr` / `.hi`. */
  key: string;
  type: FieldType;
  def: string | ByLang;
  perLang?: boolean;
  /** Longest text in characters, or the largest number. */
  max?: number;
  min?: number;
  options?: readonly string[];
};

// `pub_*` keys predate this file: the public page has always read them, so they keep their names.
export const FIELDS = {
  gymName: { key: "site.gymName", type: "text", perLang: true, max: 60, def: l3("Vihan Fitness", "विहान फिटनेस") },
  gymShort: { key: "site.gymShort", type: "text", max: 20, def: "Vihan" },
  owner: { key: "site.owner", type: "text", perLang: true, max: 40, def: l3("Bharat sir", "भरत सर") },
  ownerName: { key: "site.ownerName", type: "text", perLang: true, max: 60, def: l3("Bharat Gite", "भरत गिते") },
  town: { key: "site.town", type: "text", perLang: true, max: 40, def: l3("Nagothane", "नागोठणे") },
  accent: { key: "site.accent", type: "select", options: Object.keys(ACCENTS), def: "lime" },
  heroBg: { key: "site.heroBg", type: "select", options: HERO_BGS, def: "blinds" },

  show: { key: "site.show", type: "multi", options: SHOWABLE, def: SHOWABLE.join(",") },
  tagline: { key: "pub_tagline", type: "longtext", perLang: true, max: 300, def: l3("") },
  about: { key: "pub_about", type: "longtext", perLang: true, max: 1200, def: l3("") },
  trainer: { key: "pub_trainer", type: "longtext", perLang: true, max: 1200, def: l3("") },

  phone: { key: "pub_phone", type: "phone", def: "" },
  whatsapp: { key: "pub_whatsapp", type: "phone", def: "" },
  address: { key: "pub_address", type: "longtext", perLang: true, max: 300, def: l3("") },
  mapUrl: { key: "pub_mapUrl", type: "url", def: "" },
  timings: { key: "pub_timings", type: "longtext", perLang: true, max: 1200, def: l3("") },
  joining: { key: "pub_joining", type: "longtext", perLang: true, max: 1200, def: l3("") },
  since: { key: "pub_since", type: "text", max: 40, def: "" },
  instagram: { key: "site.instagram", type: "url", def: "" },
  facebook: { key: "site.facebook", type: "url", def: "" },
  youtube: { key: "site.youtube", type: "url", def: "" },
  reviews: { key: "site.reviews", type: "url", def: "" },

  goalOptions: { key: "site.goalOptions", type: "intList", min: 1, max: 31, def: "4,8,12,16,20" },
  defaultGoal: { key: "site.defaultGoal", type: "int", min: 1, max: 31, def: "12" },
  checklist: { key: "site.checklist", type: "items", def: JSON.stringify(BUILTIN_CHECKLIST.map((key) => ({ key, label: {} }))) },
  maxClaims: { key: "site.maxClaims", type: "int", min: 1, max: 20, def: "5" },
  maxHelp: { key: "site.maxHelp", type: "int", min: 1, max: 10, def: "3" },
  backOnTrack: { key: "site.backOnTrack", type: "int", min: 1, max: 31, def: "6" },
  methods: { key: "site.methods", type: "multi", options: PAY_METHODS, def: PAY_METHODS.join(",") },
  upiId: { key: "site.upiId", type: "upi", max: 320, def: "" },
  upiName: { key: "site.upiName", type: "text", max: 60, def: "" },
} satisfies Record<string, SiteField>;
export type FieldId = keyof typeof FIELDS;

/** Admin → More pages: which settings and which texts (wording overrides) each one edits. */
export const PAGES = {
  brand: { fields: ["gymName", "gymShort", "owner", "ownerName", "town", "accent", "heroBg"], texts: [] },
  website: {
    fields: ["show", "tagline", "about", "trainer"],
    texts: [
      "meta.title",
      "meta.description",
      "publicSite.heroTop",
      "publicSite.heroGet",
      "publicSite.heroWords",
      "publicSite.heroFallback",
      "publicSite.badge",
      "publicSite.marqueeA",
      "publicSite.marqueeB",
      "publicSite.membershipTitle",
      "publicSite.perks.calendar",
      "publicSite.perks.pay",
      "publicSite.perks.track",
      "publicSite.perks.goals",
      "publicSite.appTitle",
      "publicSite.appSub",
      "publicSite.trainerRole",
      "publicSite.ready",
      "publicSite.readySub",
      "publicSite.footer",
    ],
  },
  contact: { fields: ["phone", "whatsapp", "address", "mapUrl", "timings", "joining", "since", "instagram", "facebook", "youtube", "reviews"], texts: [] },
  messages: {
    fields: [],
    texts: ["whatsapp.templates.fee", "whatsapp.templates.attendance", "whatsapp.templates.receipt", "qr.checkinTitle", "qr.registerTitle", "qr.checkinHelp", "qr.registerHelp"],
  },
  rules: { fields: ["goalOptions", "defaultGoal", "checklist", "maxClaims", "maxHelp", "backOnTrack", "methods", "upiId", "upiName"], texts: [] },
} satisfies Record<string, { fields: FieldId[]; texts: TKey[] }>;
export type PageId = keyof typeof PAGES;

/** How each page lays its settings out: titled groups of fields (ids) and texts (i18n keys, which contain a dot). */
export const LAYOUT: Record<PageId, { group: string; items: string[] }[]> = {
  brand: [
    { group: "names", items: ["gymName", "owner", "ownerName", "town", "gymShort"] },
    { group: "look", items: ["accent", "heroBg"] },
  ],
  website: [
    { group: "sections", items: ["show"] },
    { group: "hero", items: ["publicSite.heroTop", "publicSite.heroGet", "publicSite.heroWords", "tagline", "publicSite.heroFallback", "publicSite.badge", "publicSite.marqueeA", "publicSite.marqueeB"] },
    { group: "about", items: ["about", "trainer", "publicSite.trainerRole"] },
    { group: "membership", items: ["publicSite.membershipTitle", "publicSite.perks.calendar", "publicSite.perks.pay", "publicSite.perks.track", "publicSite.perks.goals", "publicSite.appTitle", "publicSite.appSub"] },
    { group: "closing", items: ["publicSite.ready", "publicSite.readySub", "publicSite.footer"] },
    { group: "search", items: ["meta.title", "meta.description"] },
  ],
  contact: [
    { group: "contact", items: ["phone", "whatsapp", "address", "mapUrl"] },
    { group: "hours", items: ["timings", "joining", "since"] },
    { group: "social", items: ["instagram", "facebook", "youtube", "reviews"] },
  ],
  messages: [
    { group: "whatsapp", items: ["whatsapp.templates.fee", "whatsapp.templates.attendance", "whatsapp.templates.receipt"] },
    { group: "qr", items: ["qr.checkinTitle", "qr.checkinHelp", "qr.registerTitle", "qr.registerHelp"] },
  ],
  rules: [
    { group: "goals", items: ["goalOptions", "defaultGoal", "backOnTrack"] },
    { group: "checklist", items: ["checklist"] },
    { group: "limits", items: ["maxClaims", "maxHelp"] },
    { group: "payments", items: ["methods", "upiId", "upiName"] },
  ],
};
export const PAGE_IDS = Object.keys(PAGES) as PageId[];

// ───────────────────────────── wording overrides ─────────────────────────────

/** Storage key of a wording override: `text.<lang>.<i18n key>`. */
export const textKey = (lang: Lang, key: string) => `text.${lang}.${key}`;

/** The `{placeholders}` a text uses, minus the brand ones (those may be added or dropped freely). */
export function placeholders(s: string): string[] {
  const out = new Set<string>();
  for (const m of s.matchAll(/\{(\w+)\}/g)) if (!(BRAND_VARS as readonly string[]).includes(m[1])) out.add(m[1]);
  return [...out].sort();
}

/** The shipped text for a key, or undefined when the key isn't a text. */
export const defaultText = (lang: Lang, key: string) => lookup(DICTS[lang], key) ?? lookup(DICTS.en, key);

/** Every text key, in dictionary order (≈700). */
export function allTextKeys(): string[] {
  const out: string[] = [];
  const walk = (o: object, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") out.push(prefix + k);
      else walk(v as object, `${prefix}${k}.`);
    }
  };
  walk(DICTS.en, "");
  return out;
}

/** A resized copy of an uploaded photo (e.g. a square app icon): Cloudinary transforms on the fly. */
export const photoVariant = (url: string, transform: string) => (url.includes("/upload/") ? url.replace("/upload/", `/upload/${transform}/`) : url);

// ───────────────────────────── UPI ─────────────────────────────

export const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

/** upi:// link that opens GPay/PhonePe/Paytm with the amount filled in. */
export function upiLink(o: { id: string; name: string; rupees: number; note: string }) {
  const q = new URLSearchParams({ pa: o.id, pn: o.name, am: o.rupees.toFixed(2), cu: "INR", tn: o.note.slice(0, 50) });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
