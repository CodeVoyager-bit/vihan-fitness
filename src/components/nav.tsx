"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Inbox, IndianRupee, LayoutGrid, Plus, User, Users, Wallet, type LucideIcon } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { Wordmark } from "./brand";
import { LangSwitcher } from "./client";
import { cx } from "./ui";
import type { TKey } from "@/lib/i18n";

type Item = { href: string; label: TKey; icon: LucideIcon; badge?: number; exact?: boolean };

function useActive() {
  const path = usePathname();
  return (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));
}

function BottomBar({ items, center }: { items: Item[]; center?: Item }) {
  const { t } = useI18n();
  const active = useActive();
  const half = Math.ceil(items.length / 2);
  const render = (i: Item) => {
    const on = active(i);
    return (
      <li key={i.href} className="flex-1">
        <Link
          href={i.href}
          aria-current={on ? "page" : undefined}
          className={cx("relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold transition", on ? "text-ink-950" : "text-ink-500")}
        >
          <span className={cx("relative grid h-7 w-12 place-items-center rounded-full transition", on && "bg-volt")}>
            <i.icon className="size-[21px]" strokeWidth={on ? 2.4 : 2} aria-hidden />
            {!!i.badge && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-sand-0">
                <span aria-hidden>{i.badge}</span>
                <span className="sr-only">{t("nav.waiting", { n: i.badge })}</span>
              </span>
            )}
          </span>
          {t(i.label)}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label={t("nav.mainNav")} className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-sand-0/95 backdrop-blur-md lg:hidden">
      <ul className="mx-auto flex max-w-xl items-end gap-1 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
        {(center ? items.slice(0, half) : items).map(render)}
        {center && (
          <li className="flex-1">
            <Link href={center.href} className="group flex flex-col items-center gap-0.5 text-[12px] font-semibold text-ink-950">
              <span className="-mt-6 grid size-14 place-items-center rounded-[20px] bg-ink-950 text-volt shadow-[var(--shadow-lift)] ring-4 ring-sand-100 transition group-active:scale-95">
                <center.icon className="size-7" strokeWidth={2.4} aria-hidden />
              </span>
              {t(center.label)}
            </Link>
          </li>
        )}
        {center && items.slice(half).map(render)}
      </ul>
    </nav>
  );
}

function SideBar({ items, primary, footer }: { items: Item[]; primary?: Item; footer?: React.ReactNode }) {
  const { t } = useI18n();
  const active = useActive();
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sand-200 bg-sand-0 px-4 py-6 lg:flex">
      <Wordmark href={items[0].href} className="px-2" />
      {primary && (
        <Link href={primary.href} className="mt-7 flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-ink-950 font-semibold text-volt transition hover:bg-ink-800 active:scale-[0.98]">
          <primary.icon className="size-5" aria-hidden />
          {t(primary.label)}
        </Link>
      )}
      <nav aria-label={t("nav.mainNav")} className="mt-5">
        <ul className="space-y-1">
          {items.map((i) => {
            const on = active(i);
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={on ? "page" : undefined}
                  className={cx("flex min-h-11 items-center gap-3 rounded-[12px] px-3 font-semibold transition", on ? "bg-volt text-ink-950" : "text-ink-600 hover:bg-sand-100 hover:text-ink-950")}
                >
                  <i.icon className="size-5" aria-hidden />
                  <span className="flex-1">{t(i.label)}</span>
                  {!!i.badge && (
                    <span className="grid min-w-6 place-items-center rounded-full bg-bad px-1.5 text-[12px] font-bold leading-6 text-white">
                      <span aria-hidden>{i.badge}</span>
                      <span className="sr-only">{t("nav.waiting", { n: i.badge })}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto space-y-3 px-1">
        <LangSwitcher />
        {footer}
      </div>
    </aside>
  );
}

export function AdminNav({ inbox, footer }: { inbox: number; footer?: React.ReactNode }) {
  const items: Item[] = [
    { href: "/admin", label: "nav.today", icon: Home, exact: true },
    { href: "/admin/members", label: "nav.members", icon: Users },
    { href: "/admin/inbox", label: "nav.inbox", icon: Inbox, badge: inbox },
    { href: "/admin/more", label: "nav.more", icon: LayoutGrid },
  ];
  const record: Item = { href: "/admin/pay", label: "nav.record", icon: Plus };
  return (
    <>
      <SideBar items={items} primary={{ ...record, label: "admin.recordPayment", icon: IndianRupee }} footer={footer} />
      <BottomBar items={items} center={record} />
    </>
  );
}

export function MemberNav({ footer }: { footer?: React.ReactNode }) {
  const items: Item[] = [
    { href: "/app", label: "nav.home", icon: Home, exact: true },
    { href: "/app/attendance", label: "nav.visits", icon: CalendarDays },
    { href: "/app/fees", label: "nav.fees", icon: Wallet },
    { href: "/app/profile", label: "nav.profile", icon: User },
  ];
  return (
    <>
      <SideBar items={items} footer={footer} />
      <BottomBar items={items} />
    </>
  );
}
