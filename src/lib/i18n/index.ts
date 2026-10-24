import en from "./en";
import hi from "./hi";
import mr from "./mr";

export type Lang = "en" | "mr" | "hi";
export const LANGS: Lang[] = ["en", "mr", "hi"];
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Dict = DeepStrings<typeof en>;

type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Paths<typeof en>;
export type Vars = Record<string, string | number>;
export type T = (key: TKey, vars?: Vars) => string;

export const DICTS: Record<Lang, Dict> = { en, mr, hi };
export const isLang = (s: unknown): s is Lang => LANGS.includes(s as Lang);

export function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return typeof cur === "string" ? cur : undefined;
}

export const interpolate = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

/** Owner edits from Admin → More: brand names filled into every text, and wording overrides by key. */
export type TCtx = { vars?: Vars; overrides?: Record<string, string> };

export function makeT(lang: Lang, ctx: TCtx = {}): T {
  const dict = DICTS[lang];
  return (key, vars) => interpolate(ctx.overrides?.[key] ?? lookup(dict, key) ?? lookup(en, key) ?? key, ctx.vars ? { ...ctx.vars, ...vars } : vars);
}

/** For dynamic keys built at runtime (e.g. `activity.${action}`) with a safe fallback. */
export function tDynamic(t: T, key: string, fallback: TKey, vars?: Vars): string {
  const s = t(key as TKey, vars);
  return s === key ? t(fallback, vars) : s;
}
