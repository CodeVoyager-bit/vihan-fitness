import { Landing } from "@/components/landing/landing";
import { isDemo } from "@/lib/db";
import { feeFor } from "@/lib/ledger";
import { publicInfo } from "@/lib/public";
import { getUser, homeFor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

// Public page: content comes from Admin → More → Public page, so Bharat can update it without a developer.
export default async function Home({ searchParams }: { searchParams: Promise<{ bg?: string }> }) {
  const u = await getUser();
  // ?bg= previews the alternative hero backgrounds (development and demo only, never in live production).
  const bg = isDemo() || process.env.NODE_ENV !== "production" ? (await searchParams).bg : undefined;
  return <Landing info={publicInfo()} fee={(feeFor(currentMonth()) ?? 50_000) / 100} signedIn={u ? { href: homeFor(u) } : null} bg={bg} />;
}
