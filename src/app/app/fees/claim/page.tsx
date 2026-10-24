import type { Metadata } from "next";
import { ClaimForm } from "./form";
import { PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { balanceOf, feeFor } from "@/lib/ledger";
import { requireMember } from "@/lib/session";
import { currentMonth, todayIST } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("claimForm.title") };
}

export default async function ClaimPage() {
  const me = await requireMember();
  const { t } = await getT();
  const bal = await balanceOf(me.id);
  const suggested = bal.outstanding || await feeFor(currentMonth()) || 0;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("claimForm.title")} sub={t("claimForm.sub")} back={{ href: "/app/fees", label: t("nav.fees") }} />
      <ClaimForm today={todayIST()} suggested={suggested / 100} />
    </div>
  );
}
