import { LogOut } from "lucide-react";
import { AdminNav } from "@/components/nav";
import { Toaster } from "@/components/client";
import { logoutAction } from "@/app/actions/common";
import { getT } from "@/lib/i18n/server";
import { inboxCounts } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const { t } = await getT();
  const c = await inboxCounts();
  return (
    <div className="min-h-dvh lg:pl-64">
      <AdminNav
        inbox={c.claims + c.approvals + c.help}
        footer={
          <form action={logoutAction}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 font-semibold text-ink-600 hover:bg-sand-100 hover:text-ink-950">
              <LogOut className="size-5" aria-hidden />
              {t("common.signOut")}
            </button>
          </form>
        }
      />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)] sm:px-6 lg:max-w-5xl lg:px-10 lg:pb-16 lg:pt-10 xl:max-w-6xl">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
