"use client";

import Link from "next/link";
import { photoVariant } from "@/lib/site-config";
import { useBrand } from "./i18n-provider";
import { cx } from "./ui";

/** The uploaded logo (Admin → More → Brand), else the monogram: a bold V cut from a volt tile. */
export function Mark({ className }: { className?: string }) {
  const { logo } = useBrand();
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves the right size
    return <img src={photoVariant(logo, "c_pad,w_160,h_160")} alt="" className={cx("size-9 rounded-[11px] bg-white object-contain", className)} />;
  return (
    <svg viewBox="0 0 40 40" className={cx("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" className="fill-volt" />
      <path d="M9 10h7.2l3.8 12.4L23.8 10H31l-7.6 20h-6.8z" className="fill-ink-950" />
      <path d="M26.5 27.5h5v3h-5z" className="fill-ink-950" />
    </svg>
  );
}

/** Gym name as a wordmark: first word bold, the rest in the accent ("VIHAN FITNESS"). */
export function Wordmark({ dark, href = "/", className, compact }: { dark?: boolean; href?: string; className?: string; compact?: boolean }) {
  const { name } = useBrand();
  const [first, ...rest] = name.split(" ");
  return (
    <Link href={href} translate="no" className={cx("inline-flex min-h-11 items-center gap-2.5 rounded-lg", className)} aria-label={name}>
      <Mark />
      <span className={cx("whitespace-nowrap font-display text-[22px] font-extrabold uppercase leading-none tracking-tight", dark ? "text-sand-0" : "text-ink-950", compact && "hidden sm:inline")}>
        {first}
        {rest.length > 0 && (
          <>
            <span className="text-volt-ink"> </span>
            <span className={dark ? "text-volt" : "text-ink-500"}>{rest.join(" ")}</span>
          </>
        )}
      </span>
    </Link>
  );
}
