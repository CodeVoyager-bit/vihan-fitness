import type { Metadata, Viewport } from "next";
import { Anek_Devanagari, Barlow, Barlow_Condensed, Mukta } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import { DemoBanner, OfflineBanner } from "@/components/client";
import { isDemo } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { photoVariant } from "@/lib/site-config";
import { getSite } from "@/lib/site";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const mukta = Mukta({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-mukta", display: "swap" });
const anek = Anek_Devanagari({ subsets: ["devanagari"], axes: ["wdth"], variable: "--font-anek", display: "swap" });

// Names, description and icon come from Admin → More (Brand and Website).
export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  const site = await getSite(lang);
  const gym = site.vars.gym;
  const square = (px: number) => photoVariant(site.logo, `c_pad,b_white,w_${px},h_${px},f_png`);
  return {
    title: { default: t("meta.title"), template: `%s · ${gym}` },
    description: t("meta.description"),
    applicationName: gym,
    appleWebApp: { capable: true, title: gym, statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    icons: site.logo ? { icon: square(64), apple: square(180) } : { icon: { url: "/icon.svg", type: "image/svg+xml" } },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121210",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t, ctx } = await getT();
  const site = await getSite(lang);
  const a = site.accent;
  return (
    <html lang={lang} className={`${barlow.variable} ${barlowCondensed.variable} ${mukta.variable} ${anek.variable}`}>
      <body className="min-h-dvh">
        {/* Accent preset from Admin → More → Brand (fixed, contrast-checked values; never free text). */}
        {site.accentKey !== "lime" && <style>{`:root{--color-volt:${a.volt};--color-volt-soft:${a.soft};--color-volt-strong:${a.strong};--color-volt-ink:${a.ink}}`}</style>}
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-volt focus:px-4 focus:py-2 focus:text-ink-950">
          {t("common.skipToContent")}
        </a>
        <I18nProvider lang={lang} ctx={ctx} brand={{ logo: site.logo, name: (await getSite("en")).vars.gym }}>
          {isDemo() && <DemoBanner />}
          <OfflineBanner />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
