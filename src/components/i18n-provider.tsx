"use client";

import { createContext, useContext, useMemo } from "react";
import { type Lang, type T, type TCtx, makeT } from "@/lib/i18n";

/** What the header mark needs from Admin → More → Brand: the uploaded logo and the gym's English name. */
export type Brand = { logo: string; name: string };

const Ctx = createContext<{ lang: Lang; t: T; brand: Brand } | null>(null);

/** `ctx` carries the owner's brand names and this language's wording overrides from the server. */
export function I18nProvider({ lang, ctx, brand, children }: { lang: Lang; ctx: TCtx; brand: Brand; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang, ctx), brand }), [lang, ctx, brand]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

export const useBrand = () => useI18n().brand;
