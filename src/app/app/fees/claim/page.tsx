import type { Metadata } from "next";
import { ClaimForm } from "./form";
import { PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { balanceOf, feeFor } from "@/lib/ledger";
import { requireMember } from "@/lib/session";
import { currentMonth, todayIST } from "@/lib/time";

export const metadata: Metadata = { title: "I have paid" };

export default async function ClaimPage() {
  const me = await requireMember();
  const { t } = await getT();
  const bal = balanceOf(me.id);
  const suggested = bal.outstanding || feeFor(currentMonth()) || 0;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("claimForm.title")} sub={t("claimForm.sub")} back={{ href: "/app/fees", label: t("nav.fees") }} />
      <ClaimForm today={todayIST()} suggested={suggested / 100} />
    </div>
  );
}
