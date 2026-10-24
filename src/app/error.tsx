"use client";

import { RotateCcw } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { btn } from "@/components/ui";

// Nothing is shown as saved unless the server confirmed it, so retrying is always safe.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-[40px] font-extrabold leading-[1.05] text-ink-950">{t("common.somethingWrong")}</p>
      <button type="button" onClick={reset} className={`mt-6 ${btn({ variant: "dark" })}`}>
        <RotateCcw className="size-5" aria-hidden />
        {t("common.retry")}
      </button>
    </main>
  );
}
