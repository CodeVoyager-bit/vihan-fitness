import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { money } from "../format";
import { MAX_PAYMENT_PAISE } from "../ledger";
import { getUser } from "../session";
import { getSite } from "../site";
import { type Lang, LANGS, type T, type TCtx, isLang, makeT } from "./index";

export const LANG_COOKIE = "vf_lang";

/** Signed-in users get their saved preference; visitors get their cookie, then their browser language. */
export const getLang = cache(async (): Promise<Lang> => {
  const u = await getUser();
  if (u) return u.language;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  const al = (await headers()).get("accept-language") ?? "";
  if (/^mr\b/i.test(al)) return "mr";
  if (/^hi\b/i.test(al)) return "hi";
  return "en";
});

/** The owner's brand names and wording overrides for one language, plus limits the messages quote. */
export async function i18nCtx(lang: Lang): Promise<TCtx> {
  const { vars, overrides } = await getSite(lang);
  return { vars: { ...vars, maxEntry: money(MAX_PAYMENT_PAISE, lang) }, overrides };
}

export const getT = cache(async () => {
  const lang = await getLang();
  const ctx = await i18nCtx(lang);
  return { t: makeT(lang, ctx), lang, ctx };
});

/** A translator for every language (WhatsApp messages are offered in all three). */
export const allT = cache(async (): Promise<Record<Lang, T>> => Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, makeT(l, await i18nCtx(l))]))));
