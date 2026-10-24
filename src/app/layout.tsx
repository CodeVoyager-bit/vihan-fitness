import type { Metadata, Viewport } from "next";
import { Anek_Devanagari, Barlow, Barlow_Condensed, Mukta } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import { DemoBanner, OfflineBanner } from "@/components/client";
import { isDemo } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
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

export const metadata: Metadata = {
  title: { default: "Vihan Fitness · Nagothane", template: "%s · Vihan Fitness" },
  description: "Vihan Fitness, Nagothane — membership, check-ins and fees for members of Bharat Gite's gym.",
  applicationName: "Vihan Fitness",
  appleWebApp: { capable: true, title: "Vihan Fitness", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121210",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getT();
  return (
    <html lang={lang} className={`${barlow.variable} ${barlowCondensed.variable} ${mukta.variable} ${anek.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-volt focus:px-4 focus:py-2 focus:text-ink-950">
          {t("common.skipToContent")}
        </a>
        <I18nProvider lang={lang}>
          {isDemo() && <DemoBanner />}
          <OfflineBanner />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
