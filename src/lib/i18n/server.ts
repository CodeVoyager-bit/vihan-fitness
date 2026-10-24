import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getUser } from "../session";
import { type Lang, isLang, makeT } from "./index";

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

export async function getT() {
  const lang = await getLang();
  return { t: makeT(lang), lang };
}
