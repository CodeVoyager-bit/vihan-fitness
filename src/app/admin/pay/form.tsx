"use client";

import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import { ArrowRight, Banknote, Check, CircleEllipsis, Hourglass, Loader2, Smartphone, SlidersHorizontal, Undo2 } from "lucide-react";
import { type SavedPayment, recordPaymentAction } from "@/app/actions/admin";
import { FormError, Sheet, WhatsAppSheet, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, ButtonLink, Card, Field, KeyValue, Notice, Segmented, btn, cx, inputCls } from "@/components/ui";
import { fmtDate, fmtMonths, money } from "@/lib/format";
import type { Result } from "@/lib/action";
import type { Lang } from "@/lib/i18n";
import { type FutureMonth, type OpenCharge, type PlanLine, planAllocation } from "@/lib/plan";
import { isDate } from "@/lib/time";

// A dropped connection must not crash the page (a remount would mint a new key and allow a duplicate):
// report it, keep the form and its key, and let a retry be deduplicated by the server.
const savePayment = async (prev: Result<SavedPayment> | null, fd: FormData): Promise<Result<SavedPayment>> => {
  try {
    return await recordPaymentAction(prev, fd);
  } catch {
    return { ok: false, error: "network", at: Date.now() };
  }
};

type Labeled<T> = T & { label: string };
type Method = "cash" | "upi" | "other";

const toPaise = (s: string) => {
  const raw = s.replace(/[,₹\s]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
};
const toRupees = (p: number) => (p % 100 ? (p / 100).toFixed(2) : String(p / 100));
// crypto.randomUUID needs a secure context; plain-http LAN testing falls back to a random string.
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const keyOf = (l: { chargeId?: number; id?: number; month: string | null }) => ("id" in l && l.id ? `c${l.id}` : l.chargeId ? `c${l.chargeId}` : `m${l.month}`);

export function PaymentForm({
  member,
  today,
  open,
  future,
  outstanding,
  credit,
  monthFee,
  claimNotice,
  methods,
}: {
  member: { id: number; name: string; photo: string | null; wa: string | null; language: Lang };
  today: string;
  open: Labeled<OpenCharge>[];
  future: Labeled<FutureMonth>[];
  outstanding: number;
  credit: number;
  monthFee: number;
  claimNotice: string | null;
  /** Methods the owner offers (Admin → More → Rules). */
  methods: Method[];
}) {
  const { t, lang } = useI18n();
  const [state, action, pending] = useActionState(savePayment, null);
  const fieldError = useFieldError(state);
  // One key per form: a double tap or a retry on a flaky connection can't save the payment twice.
  // Created when the review sheet first opens and then reused, so retries carry the same key.
  const [idemKey, setIdemKey] = useState("");
  const ensureKey = () => idemKey || setIdemKey(newKey());
  const [amount, setAmount] = useState(toRupees(outstanding > 0 ? outstanding : monthFee));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<Method>(methods.includes("cash") ? "cash" : methods[0]);
  const [custom, setCustom] = useState(false);
  const [split, setSplit] = useState<Record<string, string>>({});

  const amt = toPaise(amount);
  const valid = Number.isFinite(amt) && amt > 0;
  const auto = useMemo(() => planAllocation(valid ? amt : 0, open, future), [amt, valid, open, future]);
  const rows = [...open.map((o) => ({ key: `c${o.id}`, chargeId: o.id, month: o.month, label: o.label, max: o.outstanding, overdue: o.overdue })), ...future.map((f) => ({ key: `m${f.month}`, chargeId: undefined, month: f.month, label: f.label, max: f.fee, overdue: false }))];

  const lines: PlanLine[] = custom
    ? rows.flatMap((r) => {
        const p = toPaise(split[r.key] ?? "0");
        return Number.isFinite(p) && p > 0 ? [{ chargeId: r.chargeId, month: r.month, amount: p }] : [];
      })
    : auto.lines;
  const allocated = lines.reduce((s, l) => s + l.amount, 0);
  const extra = valid ? amt - allocated : 0;
  // Upcoming months are paid whole (server rule), and nothing may exceed what a line can take.
  const splitBad =
    custom &&
    (rows.some((r) => {
      const p = toPaise(split[r.key] || "0");
      return Number.isNaN(p) || p > r.max || (!r.chargeId && p > 0 && p !== r.max);
    }) ||
      extra < 0);
  // Like the server: money not split by hand settles the oldest unpaid charges, the rest is credit.
  let spare = Math.max(extra, 0);
  for (const r of rows.filter((x) => x.chargeId)) {
    const room = r.max - (lines.find((l) => l.chargeId === r.chargeId)?.amount ?? 0);
    spare -= Math.min(room, spare);
  }
  const toOpen = Math.min(outstanding, lines.filter((l) => l.chargeId).reduce((s, l) => s + l.amount, 0) + (Math.max(extra, 0) - spare));
  const balanceAfter = outstanding - toOpen;
  const creditAfter = credit + spare;
  const dateOk = isDate(paidOn) && paidOn <= today && paidOn >= "2020-01-01";
  const canReview = valid && dateOk && !splitBad;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // calling the action ourselves skips React's automatic form reset after it
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
  const serverDateError = state && !state.ok && state.field === "paidOn";

  const startCustom = () => {
    setSplit(Object.fromEntries(auto.lines.map((l) => [keyOf(l), toRupees(l.amount)])));
    setCustom(true);
  };

  if (state?.ok && state.data) return <Saved data={state.data} member={member} />;

  const chips = (
    [
      monthFee > 0 && { label: t("pay.quickMonth", { amount: money(monthFee, lang) }), value: monthFee },
      outstanding > 0 && { label: t("pay.quickFull", { amount: money(outstanding, lang) }), value: outstanding },
      monthFee > 0 && { label: money(monthFee * 3, lang), value: monthFee * 3 },
    ].filter(Boolean) as { label: string; value: number }[]
  ).filter((c, i, all) => all.findIndex((x) => x.value === c.value) === i);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="key" value={idemKey} />
      <input type="hidden" name="split" value={custom ? "custom" : "auto"} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <Card className="flex items-center gap-3 p-3.5">
        <Avatar name={member.name} photo={member.photo} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("pay.recordingFor")}</p>
          <p className="truncate text-[17px] font-semibold text-ink-950">{member.name}</p>
          <p className={cx("text-[14px] font-medium", outstanding ? "text-ink-700" : "text-ok")}>
            {outstanding ? t("pay.owes", { amount: money(outstanding, lang) }) : t("pay.nothingOwed")}
            {credit > 0 && ` · ${t("memberDetail.credit")} ${money(credit, lang)}`}
          </p>
        </div>
        <Link href="/admin/pay" className={btn({ variant: "ghost", size: "sm" })}>
          {t("pay.change")}
        </Link>
      </Card>

      {claimNotice && (
        <Notice tone="info" icon={Hourglass} action={<ButtonLink href="/admin/claims" variant="dark" size="sm">{t("pay.openClaims")}</ButtonLink>}>
          {claimNotice}
        </Notice>
      )}

      <FormError state={state} fields={["amount", "paidOn"]} />

      <Field label={t("pay.amount")} htmlFor="amount" error={!valid && amount ? t("errors.amountInvalid") : fieldError("amount")}>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-[32px] font-bold text-ink-400">₹</span>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={(!valid && !!amount) || undefined}
            className="block min-h-[68px] w-full rounded-[18px] border border-sand-300 bg-white pl-11 pr-4 font-display text-[40px] font-bold tabular text-ink-950 focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40"
          />
        </div>
      </Field>
      <div className="no-scrollbar -mt-1 flex gap-2 overflow-x-auto">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => (setAmount(toRupees(c.value)), setCustom(false))}
            aria-pressed={amt === c.value}
            className={cx("min-h-10 shrink-0 rounded-full border px-3.5 text-[14px] font-semibold transition", amt === c.value ? "border-ink-950 bg-ink-950 text-sand-0" : "border-sand-300 bg-sand-0 text-ink-800")}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("pay.paidOn")} htmlFor="paidOn" error={(paidOn && !dateOk) || serverDateError ? t("errors.dateInvalid") : null}>
          <input id="paidOn" name="paidOn" type="date" min="2020-01-01" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} required />
        </Field>
        <Segmented
          name="method"
          legend={t("pay.method")}
          value={method}
          onChange={(v) => setMethod(v as Method)}
          options={[
            { value: "cash", label: t("methods.cash"), icon: Banknote },
            { value: "upi", label: t("methods.upi"), icon: Smartphone },
            { value: "other", label: t("methods.other"), icon: CircleEllipsis },
          ].filter((o) => methods.includes(o.value as Method))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("pay.reference")} htmlFor="reference" hint={t("pay.referenceHint")} optional optionalLabel={t("common.optional")}>
          <input id="reference" name="reference" maxLength={60} autoComplete="off" className={inputCls} aria-describedby="reference-hint" />
        </Field>
        <Field label={t("pay.note")} htmlFor="note" optional optionalLabel={t("common.optional")}>
          <input id="note" name="note" maxLength={200} className={inputCls} />
        </Field>
      </div>

      {/* What the money covers — live, before anything is saved. */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("pay.covers")}</h2>
          {rows.length > 0 && (
            <button type="button" onClick={custom ? () => setCustom(false) : startCustom} className={btn({ variant: "ghost", size: "sm" })}>
              {custom ? <Undo2 className="size-4" aria-hidden /> : <SlidersHorizontal className="size-4" aria-hidden />}
              {custom ? t("pay.useDefault") : t("pay.changeSplit")}
            </button>
          )}
        </div>
        {!custom ? (
          <>
            <ul className="space-y-1.5">
              {auto.lines.map((l) => {
                const r = rows.find((x) => x.key === keyOf(l))!;
                return (
                  <li key={r.key} className="flex items-center justify-between gap-3 text-[15px]">
                    <span className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded-full bg-volt text-ink-950">
                        <Check className="size-3" strokeWidth={3.5} aria-hidden />
                      </span>
                      <span className="font-medium text-ink-900">{r.label}</span>
                      {l.amount < r.max && <span className="text-[13px] text-warn">({t("monthState.part")})</span>}
                    </span>
                    <span className="font-semibold tabular">{money(l.amount, lang)}</span>
                  </li>
                );
              })}
              {auto.credit > 0 && (
                <li className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="font-medium text-ink-900">{t("pay.credit")}</span>
                  <span className="font-semibold tabular text-ok">{money(auto.credit, lang)}</span>
                </li>
              )}
            </ul>
            <p className="mt-2 text-[13px] text-ink-500">{auto.credit > 0 ? t("pay.creditHelp") : t("pay.autoNote")}</p>
          </>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <label key={r.key} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[15px] font-medium text-ink-900">
                  {r.label}
                  <span className="block text-[13px] font-normal text-ink-500">≤ {money(r.max, lang)}</span>
                </span>
                <span className="relative w-32">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">₹</span>
                  <input
                    inputMode="decimal"
                    value={split[r.key] ?? ""}
                    onChange={(e) => setSplit((s) => ({ ...s, [r.key]: e.target.value }))}
                    aria-invalid={toPaise(split[r.key] || "0") > r.max || undefined}
                    className={cx(inputCls, "pl-7 text-right tabular")}
                  />
                </span>
              </label>
            ))}
            <p className={cx("pt-1 text-[14px] font-semibold", extra < 0 || splitBad ? "text-bad" : "text-ink-700")}>
              {extra < 0 ? t("errors.allocationOverPayment") : splitBad ? t("errors.allocationWholeMonths") : spare > 0 ? `${t("pay.credit")}: ${money(spare, lang)}` : ""}
            </p>
          </div>
        )}
      </Card>

      <Card className="px-4 pb-1 pt-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">{t("pay.after")}</h2>
        <KeyValue
          items={[
            [t("pay.balanceAfter"), <span key="b" className={balanceAfter > 0 ? "text-ink-950" : "text-ok"}>{money(Math.max(balanceAfter, 0), lang)}</span>],
            [t("pay.creditAfter"), money(creditAfter, lang)],
          ]}
        />
      </Card>

      <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 -mx-1 pt-2 lg:bottom-4">
        <Sheet
          title={t("pay.confirmTitle")}
          description={t("pay.confirmHelp")}
          trigger={(openSheet) => (
            <button type="button" disabled={!canReview} onClick={() => (ensureKey(), openSheet())} className={cx(btn({ variant: "dark", size: "lg", block: true }), "shadow-[var(--shadow-lift)]")}>
              {t("pay.review", { amount: valid ? money(amt, lang) : "₹0" })}
              <ArrowRight className="size-5" aria-hidden />
            </button>
          )}
        >
          <div className="space-y-4">
            <div className="rounded-[18px] bg-ink-950 p-4 text-sand-0">
              <p className="font-display text-[44px] font-extrabold leading-none tabular text-volt">{valid ? money(amt, lang) : ""}</p>
              <p className="mt-1 text-[15px]">
                {member.name} · {t(`methods.${method}`)} · {dateOk ? fmtDate(paidOn, lang) : ""}
              </p>
            </div>
            <KeyValue
              items={[
                ...lines.map((l) => [rows.find((r) => r.key === keyOf(l))?.label ?? "", money(l.amount, lang)] as [string, string]),
                ...(spare > 0 ? ([[t("pay.credit"), money(spare, lang)]] as [string, string][]) : []),
                [t("pay.balanceAfter"), money(Math.max(balanceAfter, 0), lang)],
              ]}
            />
            {/* Errors are shown here too: the page behind the sheet is covered. */}
            <FormError state={state} />
            <button type="submit" disabled={pending} aria-busy={pending} className={btn({ variant: "primary", size: "lg", block: true })}>
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" strokeWidth={3} aria-hidden />}
              {pending ? t("pay.saving") : t("pay.save")}
            </button>
          </div>
        </Sheet>
      </div>
    </form>
  );
}

function Saved({ data, member }: { data: SavedPayment; member: { id: number; name: string; photo: string | null; wa: string | null; language: Lang } }) {
  const { t, lang } = useI18n();
  return (
    <div className="animate-rise pt-2 text-center" role="status" aria-live="polite">
      <span className="animate-pop mx-auto grid size-24 place-items-center rounded-full bg-volt text-ink-950 shadow-[0_0_0_10px_rgb(200_242_60/0.25)]">
        <Check className="size-12" strokeWidth={3} aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-[44px] font-extrabold leading-[1.05] text-ink-950">{t("pay.savedTitle")}</h1>
      <p className="mt-2 text-[17px] text-ink-700">
        {t("pay.savedBody", { amount: money(data.amount, lang), name: member.name, method: t(`methods.${data.method}`), date: fmtDate(data.paidOn, lang) })}
      </p>
      {data.duplicate && (
        <div className="mx-auto mt-3 max-w-md text-left">
          <Notice tone="warn">{t("pay.duplicate")}</Notice>
        </div>
      )}
      <Card className="mx-auto mt-5 max-w-md px-4 py-1 text-left">
        <KeyValue
          items={[
            ...(data.months.length ? ([[t("pay.covers"), fmtMonths(data.months, lang)]] as [string, string][]) : []),
            ...(data.credit ? ([[t("pay.credit"), money(data.credit, lang)]] as [string, string][]) : []),
            [t("pay.balanceAfter"), <span key="b" className={data.balance ? "" : "text-ok"}>{money(data.balance, lang)}</span>],
          ]}
        />
      </Card>
      <div className="mx-auto mt-5 grid max-w-md gap-2.5">
        <WhatsAppSheet memberId={member.id} name={member.name} waNumber={member.wa} messages={data.receipt} defaultLang={member.language} kind="receipt" label={t("pay.sendReceipt")} variant="block" />
        <div className="grid grid-cols-2 gap-2.5">
          <ButtonLink href="/admin/pay" variant="primary">
            {t("pay.recordAnother")}
          </ButtonLink>
          <ButtonLink href={`/admin/members/${member.id}?tab=payments`} variant="secondary">
            {t("pay.openMember")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
