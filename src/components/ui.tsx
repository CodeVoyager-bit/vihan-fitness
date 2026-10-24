// Presentational building blocks. No hooks here, so these render on the server or the client.
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  CircleDot,
  Clock3,
  Hourglass,
  LogOut,
  MinusCircle,
  PauseCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { initials } from "@/lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ───────────────────────────── buttons ─────────────────────────────

type BtnVariant = "primary" | "dark" | "secondary" | "ghost" | "danger" | "soft" | "whatsapp";
type BtnSize = "sm" | "md" | "lg";

export function btn({ variant = "secondary", size = "md", block = false }: { variant?: BtnVariant; size?: BtnSize; block?: boolean } = {}) {
  return cx(
    "relative inline-flex select-none items-center justify-center gap-2 rounded-[14px] font-semibold transition-[transform,background-color,box-shadow,color] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    size === "sm" && "min-h-11 px-3.5 text-[15px]",
    size === "md" && "min-h-12 px-5 text-base",
    size === "lg" && "min-h-14 px-6 text-[17px]",
    block && "w-full",
    variant === "primary" && "bg-volt text-ink-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] hover:bg-volt-strong",
    variant === "dark" && "bg-ink-900 text-sand-0 hover:bg-ink-800",
    variant === "secondary" && "border border-sand-300 bg-sand-0 text-ink-900 hover:border-ink-300 hover:bg-white",
    variant === "ghost" && "text-ink-700 hover:bg-sand-200/70",
    variant === "soft" && "bg-sand-200/80 text-ink-900 hover:bg-sand-300/70",
    variant === "danger" && "border border-bad/25 bg-bad-soft text-bad hover:bg-bad hover:text-white",
    // WhatsApp green darkened to keep white text above 4.5:1.
    variant === "whatsapp" && "bg-[#0e7a3e] text-white hover:bg-[#0b6633]",
  );
}

export function ButtonLink({
  href,
  children,
  variant,
  size,
  block,
  className,
  ...rest
}: { href: string; children: React.ReactNode; variant?: BtnVariant; size?: BtnSize; block?: boolean; className?: string } & Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className"
>) {
  return (
    <Link href={href} className={cx(btn({ variant, size, block }), className)} {...rest}>
      {children}
    </Link>
  );
}

export function IconLink({ href, label, icon: Icon, tone = "plain", external }: { href: string; label: string; icon: LucideIcon; tone?: "plain" | "wa" | "volt"; external?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cx(
        "grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95",
        tone === "plain" && "bg-sand-100 text-ink-800 hover:bg-sand-200",
        tone === "wa" && "bg-[#e3f6e8] text-[#126b3a] hover:bg-[#cdeed6]",
        tone === "volt" && "bg-volt text-ink-950 hover:bg-volt-strong",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </a>
  );
}

// ───────────────────────────── surfaces ─────────────────────────────

export function Card({ children, className, as: As = "section", ...rest }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" | "li" | "ul" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx("rounded-[var(--radius-xl)] border border-sand-200 bg-sand-0 shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({ children, action, id }: { children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-2.5 mt-7 flex items-end justify-between gap-3 px-1">
      <h2 id={id} className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, back, action }: { title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; action?: React.ReactNode }) {
  return (
    <header className="mb-5">
      {back && (
        <Link href={back.href} className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-ink-600 hover:text-ink-900">
          <ChevronLeft className="size-5" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-balance font-display text-[34px] font-extrabold leading-[1.05] text-ink-950 sm:text-[40px]">{title}</h1>
          {sub && <p className="mt-1.5 max-w-prose text-[15px] text-ink-600">{sub}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({ icon: Icon = CircleDashed, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-xl)] border border-dashed border-sand-300 bg-sand-50 px-6 py-10 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-sand-200 text-ink-600">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="font-semibold text-ink-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[15px] text-ink-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", icon, children, action }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-[15px]", TONE_BG[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Avatar({ name, size = "md", tone = "sand" }: { name: string; size?: "sm" | "md" | "lg"; tone?: "sand" | "volt" | "ink" }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-display font-bold uppercase",
        size === "sm" && "size-9 text-[15px]",
        size === "md" && "size-11 text-lg",
        size === "lg" && "size-16 text-2xl",
        tone === "sand" && "bg-sand-200 text-ink-800",
        tone === "volt" && "bg-volt text-ink-950",
        tone === "ink" && "bg-ink-900 text-volt",
      )}
    >
      {initials(name)}
    </span>
  );
}

// ───────────────────────────── badges ─────────────────────────────

export type Tone = "ok" | "warn" | "bad" | "info" | "mute" | "volt";
const TONE_BG: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  mute: "bg-mute-soft text-mute",
  volt: "bg-volt-soft text-volt-ink",
};
const TONE_ICON: Record<Tone, LucideIcon> = { ok: CheckCircle2, warn: Clock3, bad: AlertTriangle, info: Hourglass, mute: MinusCircle, volt: CircleDot };

/** Status is always icon + text, never colour alone. */
export function Badge({ tone, icon, children, className, wrap }: { tone: Tone; icon?: LucideIcon | null; children: React.ReactNode; className?: string; wrap?: boolean }) {
  const Icon = icon === null ? null : (icon ?? TONE_ICON[tone]);
  return (
    <span className={cx("inline-flex gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-[13px] font-semibold leading-5", wrap ? "max-w-full items-start rounded-[12px]" : "items-center whitespace-nowrap", TONE_BG[tone], className)}>
      {Icon && <Icon className={cx("size-3.5 shrink-0", wrap && "mt-[3px]")} aria-hidden strokeWidth={2.5} />}
      {children}
    </span>
  );
}

export const STATUS_BADGE: Record<string, { tone: Tone; icon: LucideIcon }> = {
  active: { tone: "ok", icon: CheckCircle2 },
  paused: { tone: "warn", icon: PauseCircle },
  left: { tone: "mute", icon: LogOut },
  paid: { tone: "ok", icon: CheckCircle2 },
  part: { tone: "warn", icon: CircleDot },
  unpaid: { tone: "warn", icon: Clock3 },
  overdue: { tone: "bad", icon: AlertTriangle },
  waived: { tone: "mute", icon: Ban },
  none: { tone: "mute", icon: MinusCircle },
  notStarted: { tone: "mute", icon: Clock3 },
  pending: { tone: "info", icon: Hourglass },
  confirmed: { tone: "ok", icon: CheckCircle2 },
  rejected: { tone: "bad", icon: XCircle },
  open: { tone: "info", icon: CircleDot },
  acknowledged: { tone: "volt", icon: CheckCircle2 },
  resolved: { tone: "ok", icon: CheckCircle2 },
};

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  const s = STATUS_BADGE[status] ?? { tone: "mute" as Tone, icon: CircleDot };
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {label}
    </Badge>
  );
}

// ───────────────────────────── numbers & progress ─────────────────────────────

export function Stat({
  label,
  value,
  sub,
  href,
  tone,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: "bad" | "info" | "volt";
  icon?: LucideIcon;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-600">
        {Icon && <Icon className={cx("size-4", tone === "bad" ? "text-bad" : tone === "info" ? "text-info" : "text-ink-500")} aria-hidden />}
        {label}
      </span>
      <span className="mt-1 font-display text-[30px] font-bold leading-none tabular text-ink-950">{value}</span>
      {sub && <span className="mt-1 text-[13px] text-ink-500">{sub}</span>}
    </>
  );
  const cls = "flex min-h-[104px] flex-col rounded-[var(--radius-lg)] border border-sand-200 bg-sand-0 p-3.5 shadow-[var(--shadow-card)]";
  return href ? (
    <Link href={href} className={cx(cls, "transition hover:border-ink-300 active:scale-[0.98]")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function ProgressRing({ value, max, size = 132, stroke = 12, label, children, dark }: { value: number; max: number; size?: number; stroke?: number; label: string; children?: React.ReactNode; dark?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={dark ? "stroke-white/10" : "stroke-sand-200"} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-volt transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-2.5 overflow-hidden rounded-full bg-sand-200">
      <div className="h-full rounded-full bg-volt transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ───────────────────────────── form fields ─────────────────────────────

export const inputCls =
  "block min-h-12 w-full rounded-[14px] border border-sand-300 bg-white px-3.5 py-2.5 text-[16px] text-ink-950 placeholder:text-ink-400 transition focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/15";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  optionalLabel,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  optionalLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[15px] font-semibold text-ink-900">
        {label}
        {optional && <span className="text-[13px] font-normal text-ink-500">({optionalLabel ?? "optional"})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="flex items-start gap-1.5 text-[14px] font-medium text-bad">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-[13px] text-ink-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Radio group styled as a segmented control. Native radios = keyboard + screen reader support for free. */
export function Segmented({ name, options, defaultValue, legend, value, onChange }: { name: string; options: { value: string; label: string; icon?: LucideIcon }[]; defaultValue?: string; legend: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[15px] font-semibold text-ink-900">{legend}</legend>
      <div className="grid gap-1.5 rounded-[16px] bg-sand-200/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              className="peer sr-only"
              {...(value !== undefined ? { checked: value === o.value, onChange: () => onChange?.(o.value) } : { defaultChecked: defaultValue === o.value })}
            />
            <span className="flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] px-2 text-[15px] font-semibold text-ink-600 transition peer-checked:bg-white peer-checked:text-ink-950 peer-checked:shadow-[var(--shadow-card)] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-ink-900">
              {o.icon && <o.icon className="size-4" aria-hidden />}
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function KeyValue({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-sand-200">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]">
          <dt className="text-ink-600">{k}</dt>
          <dd className="text-right font-semibold text-ink-950 tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
