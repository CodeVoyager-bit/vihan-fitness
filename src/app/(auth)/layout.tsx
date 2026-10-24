import { CalendarCheck2, IndianRupee, Languages } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { LangSwitcher } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="dark-surface relative overflow-hidden bg-ink-950 px-5 pb-16 pt-[max(env(safe-area-inset-top),16px)] text-sand-0 lg:flex lg:min-h-dvh lg:flex-col lg:px-12 lg:py-10">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-volt/25 blur-[120px]" />
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" />
        <div className="relative flex items-center justify-between gap-3">
          <Wordmark dark />
          <LangSwitcher dark />
        </div>
        <div className="relative mt-auto hidden lg:block">
          <p className="font-display text-[88px] font-black uppercase leading-[0.85] tracking-tight">
            Show up.
            <br />
            <span className="text-volt">Keep going.</span>
          </p>
          <ul className="mt-10 space-y-3 text-[17px] text-sand-0/80">
            <li className="flex items-center gap-3"><CalendarCheck2 className="size-5 text-volt" aria-hidden />{t("nav.visits")} · {t("member.checkIn")}</li>
            <li className="flex items-center gap-3"><IndianRupee className="size-5 text-volt" aria-hidden />{t("nav.fees")} · {t("member.iHavePaid")}</li>
            <li className="flex items-center gap-3"><Languages className="size-5 text-volt" aria-hidden />English · मराठी · हिन्दी</li>
          </ul>
          <p className="mt-12 text-[14px] text-sand-0/50">{t("common.appName")} · {t("common.gymTown")}</p>
        </div>
      </aside>
      <main id="main" className="relative -mt-10 px-4 pb-12 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-10">
        <div className="mx-auto w-full max-w-[440px] rounded-[var(--radius-2xl)] border border-sand-200 bg-sand-0 p-5 shadow-[var(--shadow-lift)] sm:p-7 lg:border-0 lg:bg-transparent lg:shadow-none">
          {children}
        </div>
      </main>
    </div>
  );
}
