// Owner-editable site settings: read once per request, resolved per language, validated on save.
// The schema (keys, defaults, limits) lives in site-config.ts so the admin forms can share it.
import crypto from "node:crypto";
import { cache } from "react";
import { AppError, settingsByPrefix, setSettings } from "./db";
import { type Lang, LANGS } from "./i18n";
import { PHOTO_SLOTS, type PhotoSlot } from "./photos";
import { PUBLIC_KEYS, type PublicKey } from "./public";
import {
  ACCENTS,
  type AccentKey,
  BRAND_VARS,
  BUILTIN_CHECKLIST,
  type ChecklistItem,
  FIELDS,
  type FieldId,
  HERO_BGS,
  PAGES,
  type PageId,
  PAY_METHODS,
  SHOWABLE,
  SOCIALS,
  type Showable,
  type SiteField,
  UPI_RE,
  defaultText,
  placeholders,
  textKey,
} from "./site-config";

/** Everything the owner can edit, in one query per request. */
const load = cache(() => settingsByPrefix(["site.", "text.", "pub_", "photo_"]));

const def = (f: SiteField, lang: Lang) => (typeof f.def === "string" ? f.def : f.def[lang]);

/**
 * A field's value in `lang`. Per-language fields: the owner's text for that language, else his English
 * text, else the built-in default for that language. Empty stored values count as unset.
 */
function value(m: Map<string, string>, id: FieldId, lang: Lang = "en"): string {
  const f: SiteField = FIELDS[id];
  if (!f.perLang) return m.get(f.key) ?? def(f, "en");
  if (lang !== "en" && m.get(`${f.key}.${lang}`)) return m.get(`${f.key}.${lang}`)!;
  return m.get(f.key) || def(f, lang);
}

const list = (s: string) => s.split(",").filter(Boolean);

export type Site = Awaited<ReturnType<typeof getSite>>;

export const getSite = cache(async (lang: Lang) => {
  const m = await load();
  const v = (id: FieldId) => value(m, id, lang);
  const accentKey = (Object.hasOwn(ACCENTS, v("accent")) ? v("accent") : "lime") as AccentKey;
  const shown = new Set(list(v("show")));
  const prefix = `text.${lang}.`;
  return {
    vars: { gym: v("gymName"), gymShort: v("gymShort"), owner: v("owner"), ownerName: v("ownerName"), town: v("town") } satisfies Record<(typeof BRAND_VARS)[number], string>,
    /** This language's wording overrides, keyed by i18n key. */
    overrides: Object.fromEntries([...m].filter(([k]) => k.startsWith(prefix)).map(([k, s]) => [k.slice(prefix.length), s])),
    accentKey,
    accent: ACCENTS[accentKey],
    heroBg: (HERO_BGS as readonly string[]).includes(v("heroBg")) ? v("heroBg") : "blinds",
    logo: m.get("photo_logo") ?? "",
    show: Object.fromEntries(SHOWABLE.map((s) => [s, shown.has(s)])) as Record<Showable, boolean>,
    info: Object.fromEntries(PUBLIC_KEYS.map((k) => [k, v(k)])) as Record<PublicKey, string>,
    photos: Object.fromEntries(PHOTO_SLOTS.map((s) => [s, m.get(`photo_${s}`) ?? ""])) as Record<PhotoSlot, string>,
    social: Object.fromEntries(SOCIALS.map((s) => [s, v(s)])) as Record<(typeof SOCIALS)[number], string>,
  };
});

/** Business rules the owner sets (goals, checklist, limits, payment methods, UPI). */
export const getRules = cache(async () => {
  const m = await load();
  const v = (id: FieldId) => value(m, id);
  const goalOptions = list(v("goalOptions")).map(Number);
  return {
    goalOptions,
    defaultGoal: Number(v("defaultGoal")),
    checklist: JSON.parse(v("checklist")) as ChecklistItem[],
    maxClaims: Number(v("maxClaims")),
    maxHelp: Number(v("maxHelp")),
    backOnTrack: Number(v("backOnTrack")),
    methods: list(v("methods")) as (typeof PAY_METHODS)[number][],
    upiId: v("upiId"),
    upiName: v("upiName"),
  };
});
export type Rules = Awaited<ReturnType<typeof getRules>>;

/** Raw values for an admin page's form: per-language fields as { en, mr, hi } (blank = not set). */
export async function pageValues(page: PageId) {
  const m = await load();
  const fields = Object.fromEntries(
    (PAGES[page].fields as readonly FieldId[]).map((id) => {
      const f: SiteField = FIELDS[id];
      if (!f.perLang) return [id, value(m, id)];
      // English shows its effective value; other languages show only what was typed (blank = uses English),
      // except the built-in defaults, which show while English is still the default too.
      const custom = !!m.get(f.key);
      return [id, Object.fromEntries(LANGS.map((l) => [l, l === "en" ? value(m, id) : m.get(`${f.key}.${l}`) || (custom ? "" : def(f, l))]))];
    }),
  ) as Record<FieldId, string | Record<Lang, string>>;
  const texts = Object.fromEntries((PAGES[page].texts as readonly string[]).map((k) => [k, Object.fromEntries(LANGS.map((l) => [l, m.get(textKey(l, k)) ?? defaultText(l, k)!]))]));
  return { fields, texts: texts as Record<string, Record<Lang, string>> };
}

// ───────────────────────────── validation ─────────────────────────────

const input = (id: FieldId, lang?: Lang) => (lang ? `f.${id}.${lang}` : `f.${id}`);
const textInput = (lang: Lang, key: string) => `t.${lang}.${key}`;
export { input as fieldInputName, textInput as textInputName };

/** One field's cleaned value: `null` deletes the setting (back to default), a string is stored. */
function clean(id: FieldId, raw: string | string[], name: string): string | null {
  const f: SiteField = FIELDS[id];
  if (f.type === "multi") {
    const picked = (Array.isArray(raw) ? raw : [raw]).filter((x) => f.options!.includes(x));
    if (id === "methods" && !picked.length) throw new AppError("methodsEmpty", name);
    return f.options!.filter((o) => picked.includes(o)).join(","); // "" is a real choice (nothing shown)
  }
  const s = (Array.isArray(raw) ? raw[0] ?? "" : raw).replace(/\r\n/g, "\n").trim();
  if (!s) return null;
  switch (f.type) {
    case "text":
      if (s.length > f.max!) throw new AppError("textTooLong", name);
      return s.replace(/\s+/g, " ");
    case "longtext":
      if (s.length > f.max!) throw new AppError("textTooLong", name);
      return s;
    case "url":
      if (s.length > 500 || !/^https:\/\/[^\s/$.?#][^\s]*$/i.test(s)) throw new AppError("urlInvalid", name);
      return s;
    case "phone": {
      const p = s.replace(/[^\d+ ]/g, "").trim().slice(0, 20);
      return p || null;
    }
    case "int": {
      const n = Number(s);
      if (!Number.isInteger(n) || n < f.min! || n > f.max!) throw new AppError("numberRange", name);
      return String(n);
    }
    case "intList": {
      const ns = [...new Set(s.split(/[\s,]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);
      if (ns.length < 2 || ns.length > 8 || ns.some((n) => !Number.isInteger(n) || n < f.min! || n > f.max!)) throw new AppError("goalListInvalid", name);
      return ns.join(",");
    }
    case "select":
      if (!f.options!.includes(s)) throw new AppError("invalidInput", name);
      return s;
    case "upi":
      if (!UPI_RE.test(s)) throw new AppError("upiInvalid", name);
      return s;
    case "items":
      return JSON.stringify(cleanChecklist(s, name));
  }
  throw new AppError("invalidInput", name);
}

/** Checklist from the form: 1–10 items; built-in items may keep their translated label, new ones need one. */
function cleanChecklist(json: string, name: string): ChecklistItem[] {
  let rows: { key?: string; label?: Partial<Record<Lang, string>> }[];
  try {
    rows = JSON.parse(json);
  } catch {
    throw new AppError("checklistInvalid", name);
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10) throw new AppError("checklistInvalid", name);
  const seen = new Set<string>();
  return rows.map((r) => {
    const label = Object.fromEntries(LANGS.map((l) => [l, String(r.label?.[l] ?? "").trim().replace(/\s+/g, " ")]).filter(([, s]) => s)) as Partial<Record<Lang, string>>;
    if (Object.values(label).some((s) => s!.length > 60)) throw new AppError("checklistInvalid", name);
    let key = typeof r.key === "string" && /^[a-zA-Z][a-zA-Z0-9]{1,15}$/.test(r.key) ? r.key : "";
    if (!key || seen.has(key)) key = `c${crypto.randomBytes(4).toString("hex")}`;
    seen.add(key);
    if (!(BUILTIN_CHECKLIST as readonly string[]).includes(key) && !label.en) throw new AppError("checklistInvalid", name);
    return { key, label };
  });
}

/** A wording override: `null` = back to the shipped text. The `{placeholders}` must stay the same. */
export function cleanText(lang: Lang, key: string, raw: string, name = textInput(lang, key)): string | null {
  const original = defaultText(lang, key);
  if (original === undefined) throw new AppError("invalidInput", name);
  const s = raw.replace(/\r\n/g, "\n"); // not trimmed: some texts end in a space on purpose (marquee separators)
  if (!s.trim() || s === original) return null;
  if (s.length > 2000) throw new AppError("textTooLong", name);
  if (placeholders(s).join() !== placeholders(original).join()) throw new AppError("placeholdersChanged", name);
  return s;
}

/** Validates and stores everything an admin page submits. Returns the keys written, for the audit log. */
export async function savePage(page: PageId, fd: FormData): Promise<string[]> {
  const out: Record<string, string | null> = {};
  for (const id of PAGES[page].fields as readonly FieldId[]) {
    const f: SiteField = FIELDS[id];
    if (f.perLang) for (const l of LANGS) out[l === "en" ? f.key : `${f.key}.${l}`] = clean(id, String(fd.get(input(id, l)) ?? ""), input(id, l));
    else out[f.key] = clean(id, f.type === "multi" ? fd.getAll(input(id)).map(String) : String(fd.get(input(id)) ?? ""), input(id));
  }
  for (const key of PAGES[page].texts as readonly string[]) for (const l of LANGS) out[textKey(l, key)] = cleanText(l, key, String(fd.get(textInput(l, key)) ?? ""));

  if (page === "rules") {
    const goals = list(out[FIELDS.goalOptions.key] ?? FIELDS.goalOptions.def).map(Number);
    if (!goals.includes(Number(out[FIELDS.defaultGoal.key] ?? FIELDS.defaultGoal.def))) throw new AppError("defaultGoalMissing", input("defaultGoal"));
  }
  await setSettings(out);
  return Object.keys(out);
}

/** The all-wording editor saves one text in all three languages at once. */
export async function saveText(key: string, fd: FormData) {
  await setSettings(Object.fromEntries(LANGS.map((l) => [textKey(l, key), cleanText(l, key, String(fd.get(textInput(l, key)) ?? ""))])));
}
