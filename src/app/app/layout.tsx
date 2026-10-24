import { LogOut } from "lucide-react";
import { MemberNav } from "@/components/nav";
import { logoutAction } from "@/app/actions/common";
import { getT } from "@/lib/i18n/server";
import { Toaster } from "@/components/client";
import { requireMember } from "@/lib/session";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  const { t } = await getT();
  return (
    <div className="min-h-dvh lg:pl-64">
      <MemberNav
        footer={
          <form action={logoutAction}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 font-semibold text-ink-600 hover:bg-sand-100 hover:text-ink-950">
              <LogOut className="size-5" aria-hidden />
              {t("common.signOut")}
            </button>
          </form>
        }
      />
      <main id="main" className="mx-auto max-w-xl px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)] sm:px-6 lg:max-w-5xl lg:px-10 lg:pb-16 lg:pt-10">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
