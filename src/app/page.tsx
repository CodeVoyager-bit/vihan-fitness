import { Landing } from "@/components/landing/landing";
import { isDemo } from "@/lib/db";
import { feeFor } from "@/lib/ledger";
import { getSite } from "@/lib/site";
import { getUser, homeFor } from "@/lib/session";
import { currentMonth, todayIST } from "@/lib/time";
import { fmtDate } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

// Public page: everything on it comes from Admin → More (Brand, Website, Contact), so the owner can
// update it without a developer.
export default async function Home({ searchParams }: { searchParams: Promise<{ bg?: string }> }) {
  const u = await getUser();
  // ?bg= previews another homepage background before picking it (admins, development and demo only).
  const preview = isDemo() || process.env.NODE_ENV !== "production" || u?.role === "admin" ? (await searchParams).bg : undefined;
  const { lang } = await getT();
  const site = await getSite(lang);
  const today = todayIST();
  return (
    <Landing
      info={site.info}
      photos={site.photos}
      fee={(await feeFor(currentMonth()) ?? 50_000) / 100}
      signedIn={u ? { href: homeFor(u) } : null}
      todayLabel={fmtDate(today, lang, { weekday: "long", day: "numeric", month: "long" })}
      year={Number(today.slice(0, 4))}
      site={{ ownerName: site.vars.ownerName, accent: site.accent, heroBg: preview || site.heroBg, show: site.show, social: site.social }}
    />
  );
}
