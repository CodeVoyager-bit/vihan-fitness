"use client";

import { createContext, useContext, useMemo } from "react";
import { type Lang, type T, DICTS, interpolate, lookup } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; t: T } | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => {
    const dict = DICTS[lang];
    const t: T = (key, vars) => interpolate(lookup(dict, key) ?? key, vars);
    return { lang, t };
  }, [lang]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
