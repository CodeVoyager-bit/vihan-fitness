import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "./form";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPage() {
  const { t } = await getT();
  return (
    <>
      <h1 className="font-display text-[40px] font-extrabold leading-[1.05] text-ink-950">{t("auth.resetTitle")}</h1>
      <p className="mb-6 mt-2 text-ink-600">{t("auth.resetSub")}</p>
      <ResetForm />
      <Link href="/login" className="mt-6 inline-flex min-h-11 items-center text-[15px] font-medium text-ink-600 hover:text-ink-950">
        ← {t("auth.login")}
      </Link>
    </>
  );
}
