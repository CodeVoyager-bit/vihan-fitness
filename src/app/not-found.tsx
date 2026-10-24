import Link from "next/link";
import { Mark } from "@/components/brand";
import { btn } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Mark className="size-14" />
      <p className="mt-6 font-display text-[96px] font-black leading-none text-ink-950">404</p>
      <p className="mt-2 text-ink-600">{t("common.notFound")}</p>
      <Link href="/" className={`mt-6 ${btn({ variant: "dark" })}`}>
        {t("common.back")}
      </Link>
    </main>
  );
}
