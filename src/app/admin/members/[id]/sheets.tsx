"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarMinus, CalendarPlus, Check, KeyRound, Plus, RotateCcw, Undo2 } from "lucide-react";
import { addChargeAction, followupPrefAction, onboardingAction, resetCodeAction, reverseWaiverAction, setStatusAction, visitAction, waiveAction } from "@/app/actions/admin";
import { reversePaymentAction } from "@/app/actions/admin";
import { FormError, Sheet, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, Notice, Segmented, btn, cx, inputCls } from "@/components/ui";
import { fmtMonth, fmtTime, money } from "@/lib/format";
import type { MemberStatus } from "@/lib/ledger";

const rupeesValue = (p: number) => String(p / 100);

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

export function WaiveSheet({ chargeId, outstanding, label }: { chargeId: number; outstanding: number; label: string }) {
  const { t, lang } = useI18n();
  const done = useRefresh();
  return (
    <Sheet
      title={t("memberDetail.waiveTitle")}
      description={t("memberDetail.waiveHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "ghost", size: "sm" })}>
          {t("memberDetail.waive")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={waiveAction} successMessage={t("settings.saved")} onDone={() => (close(), done())}>
          {(state) => (
            <WaiveFields state={state} chargeId={chargeId} outstanding={outstanding} label={label} lang={lang} />
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

function WaiveFields({ state, chargeId, outstanding, label, lang }: { state: Parameters<typeof useFieldError>[0]; chargeId: number; outstanding: number; label: string; lang: "en" | "mr" | "hi" }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <input type="hidden" name="chargeId" value={chargeId} />
      <p className="rounded-[14px] bg-sand-100 px-4 py-3 text-[15px]">
        <span className="font-semibold">{label}</span> · {t("memberDetail.left", { amount: money(outstanding, lang) })}
      </p>
      <FormError state={state} fields={["amount", "reason"]} />
      <Field label={t("common.amount")} htmlFor="w-amount" error={err("amount")}>
        <input id="w-amount" name="amount" inputMode="decimal" defaultValue={rupeesValue(outstanding)} className={inputCls} required />
      </Field>
      <Field label={t("common.reason")} htmlFor="w-reason" error={err("reason")}>
        <input id="w-reason" name="reason" className={inputCls} required maxLength={200} />
      </Field>
      <SubmitButton pendingLabel={t("common.saving")} variant="dark">
        {t("memberDetail.waive")}
      </SubmitButton>
    </>
  );
}

export function UndoWaiverSheet({ waiverId }: { waiverId: number }) {
  const { t } = useI18n();
  const done = useRefresh();
  return (
    <Sheet
      title={t("memberDetail.undoWaiver")}
      trigger={(open) => (
        <button type="button" onClick={open} className="inline-flex min-h-11 items-center gap-1 px-2 text-[13px] font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-950">
          <Undo2 className="size-3.5" aria-hidden />
          {t("memberDetail.undoWaiver")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={reverseWaiverAction} successMessage={t("settings.saved")} onDone={() => (close(), done())}>
          {(state) => (
            <>
              <input type="hidden" name="waiverId" value={waiverId} />
              <FormError state={state} fields={["reason"]} />
              <ReasonField state={state} />
              <SubmitButton pendingLabel={t("common.saving")} variant="dark">
                {t("memberDetail.undoWaiver")}
              </SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

function ReasonField({ state, placeholder }: { state: Parameters<typeof useFieldError>[0]; placeholder?: string }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <Field label={t("common.reason")} htmlFor="reason" error={err("reason")}>
      <textarea id="reason" name="reason" rows={2} required maxLength={300} placeholder={placeholder} className={cx(inputCls, "resize-none")} />
    </Field>
  );
}

export function ReversePaymentSheet({ paymentId, summary }: { paymentId: number; summary: string }) {
  const { t } = useI18n();
  const done = useRefresh();
  return (
    <Sheet
      title={t("memberDetail.reverseTitle")}
      description={t("memberDetail.reverseHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={cx(btn({ variant: "ghost", size: "sm" }), "text-bad hover:bg-bad-soft")}>
          <RotateCcw className="size-4" aria-hidden />
          {t("memberDetail.reverse")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={reversePaymentAction} successMessage={t("settings.saved")} onDone={() => (close(), done())}>
          {(state) => (
            <>
              <input type="hidden" name="paymentId" value={paymentId} />
              <p className="rounded-[14px] bg-sand-100 px-4 py-3 text-[15px] font-semibold">{summary}</p>
              <FormError state={state} fields={["reason"]} />
              <ReasonField state={state} />
              <SubmitButton pendingLabel={t("common.saving")} variant="danger">
                {t("memberDetail.reverseDo")}
              </SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

export function AddChargeSheet({ memberId }: { memberId: number }) {
  const { t } = useI18n();
  const done = useRefresh();
  return (
    <Sheet
      title={t("memberDetail.addChargeTitle")}
      description={t("memberDetail.addChargeHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "secondary", size: "sm" })}>
          <Plus className="size-4" aria-hidden />
          {t("memberDetail.addCharge")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={addChargeAction} successMessage={t("settings.saved")} onDone={() => (close(), done())}>
          {(state) => <ChargeFields state={state} memberId={memberId} />}
        </SheetForm>
      )}
    </Sheet>
  );
}

function ChargeFields({ state, memberId }: { state: Parameters<typeof useFieldError>[0]; memberId: number }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <input type="hidden" name="memberId" value={memberId} />
      <FormError state={state} fields={["amount", "description"]} />
      <Segmented
        name="kind"
        legend={t("memberDetail.chargeKind")}
        defaultValue="opening"
        options={[
          { value: "opening", label: t("memberDetail.opening") },
          { value: "manual", label: t("memberDetail.manual") },
        ]}
      />
      <Field label={t("common.amount")} htmlFor="c-amount" error={err("amount")}>
        <input id="c-amount" name="amount" inputMode="decimal" className={inputCls} required />
      </Field>
      <Field label={t("memberDetail.description")} htmlFor="c-desc" error={err("description")}>
        <input id="c-desc" name="description" className={inputCls} required maxLength={200} />
      </Field>
      <SubmitButton pendingLabel={t("common.saving")} variant="dark">
        {t("memberDetail.addCharge")}
      </SubmitButton>
    </>
  );
}

export type StatusCharge = { month: string; outstanding: number; paid: number };

export function StatusSheet({ memberId, current, months, charges, billingStart }: { memberId: number; current: MemberStatus; months: string[]; charges: StatusCharge[]; billingStart: string }) {
  const { t, lang } = useI18n();
  const done = useRefresh();
  const [status, setStatus] = useState<MemberStatus>(current === "active" ? "paused" : "active");
  const [month, setMonth] = useState(months.find((m) => m >= billingStart) ?? months[0]);
  const affected = status === "active" ? [] : charges.filter((c) => c.month >= month && c.outstanding > 0);
  return (
    <Sheet
      title={t("memberDetail.changeStatus")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "secondary", size: "sm" })}>
          {t("memberDetail.changeStatus")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={setStatusAction} successMessage={t("settings.saved")} onDone={() => (close(), done())}>
          {(state) => (
            <>
              <input type="hidden" name="memberId" value={memberId} />
              <FormError state={state} fields={[]} />
              <Segmented
                name="status"
                legend={t("common.status")}
                value={status}
                onChange={(v) => setStatus(v as MemberStatus)}
                options={(["active", "paused", "left"] as const).map((s) => ({ value: s, label: t(`memberStatus.${s}`) }))}
              />
              <Field label={t("memberDetail.effectiveMonth")} htmlFor="s-month">
                <select id="s-month" name="effectiveMonth" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
                  {months.filter((m) => m >= billingStart).map((m) => (
                    <option key={m} value={m}>
                      {fmtMonth(m, lang, "long")}
                    </option>
                  ))}
                </select>
              </Field>
              {status === "active" ? (
                <Notice tone="info">{t("memberDetail.statusResumeNote")}</Notice>
              ) : affected.length ? (
                <Notice tone="warn">
                  <p className="font-semibold">{t("memberDetail.statusPreviewWaive")}</p>
                  <ul className="mt-1 list-inside list-disc">
                    {affected.map((c) => (
                      <li key={c.month}>
                        {fmtMonth(c.month, lang)} — {money(c.outstanding, lang)}
                      </li>
                    ))}
                  </ul>
                  {affected.some((c) => c.paid > 0) && <p className="mt-1">{t("memberDetail.statusPreviewPaid")}</p>}
                </Notice>
              ) : (
                <Notice tone="ok">{t("memberDetail.statusPreviewNone")}</Notice>
              )}
              <Field label={t("common.reason")} htmlFor="s-reason" optional optionalLabel={t("common.optional")}>
                <input id="s-reason" name="reason" className={inputCls} maxLength={200} />
              </Field>
              <SubmitButton pendingLabel={t("common.saving")} variant="dark">
                {t("common.confirm")}
              </SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

export function VisitSheet({ memberId, mode, today }: { memberId: number; mode: "add" | "remove"; today: string }) {
  const { t } = useI18n();
  const done = useRefresh();
  const Icon = mode === "add" ? CalendarPlus : CalendarMinus;
  const label = mode === "add" ? t("memberDetail.addVisit") : t("memberDetail.removeVisit");
  return (
    <Sheet
      title={label}
      description={t("memberDetail.visitHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "secondary", size: "sm" })}>
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={visitAction} successMessage={t("settings.saved")} onDone={() => (close(), done())}>
          {(state) => (
            <>
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="present" value={mode === "add" ? "1" : "0"} />
              <FormError state={state} fields={["reason"]} />
              <Field label={t("memberDetail.visitDate")} htmlFor="v-date">
                <input id="v-date" type="date" name="date" max={today} defaultValue={today} className={inputCls} required />
              </Field>
              <ReasonField state={state} />
              <SubmitButton pendingLabel={t("common.saving")} variant="dark">
                {label}
              </SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

export function Checklist({ memberId, items }: { memberId: number; items: { key: string; label: string; done: boolean }[] }) {
  const [pending, start] = useTransition();
  const done = useRefresh();
  return (
    <ul className={cx("space-y-1.5", pending && "opacity-70")}>
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            role="checkbox"
            aria-checked={i.done}
            onClick={() => start(async () => (await onboardingAction(memberId, i.key, !i.done), done()))}
            className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-2 text-left transition hover:bg-sand-100"
          >
            <span className={cx("grid size-7 shrink-0 place-items-center rounded-full border-2 transition", i.done ? "border-ink-950 bg-ink-950 text-volt" : "border-sand-300 bg-white")}>
              {i.done && <Check className="size-4" strokeWidth={3} aria-hidden />}
            </span>
            <span className={cx("text-[15px] font-medium", i.done ? "text-ink-500 line-through decoration-ink-300" : "text-ink-900")}>{i.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FollowupToggle({ memberId, on }: { memberId: number; on: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const done = useRefresh();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() => start(async () => (await followupPrefAction(memberId, !on), done()))}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] text-left"
    >
      <span className="text-[15px] font-medium text-ink-900">{t("memberDetail.followupPref")}</span>
      <span className="flex items-center gap-2 text-[14px] font-semibold text-ink-600">
        {on ? t("memberDetail.followupOn") : t("memberDetail.followupOff")}
        <span className={cx("relative h-7 w-12 rounded-full transition", on ? "bg-ink-950" : "bg-sand-300")}>
          <span className={cx("absolute top-1 size-5 rounded-full transition-all", on ? "left-6 bg-volt" : "left-1 bg-white")} />
        </span>
      </span>
    </button>
  );
}

export function ResetCodeSheet({ memberId, name }: { memberId: number; name: string }) {
  const { t, lang } = useI18n();
  return (
    <Sheet
      title={t("memberDetail.resetCode")}
      description={t("memberDetail.resetHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "secondary", size: "sm" })}>
          <KeyRound className="size-4" aria-hidden />
          {t("memberDetail.resetCode")}
        </button>
      )}
    >
      <SheetForm action={resetCodeAction}>
        {(state) =>
          state?.ok && state.data ? (
            <div className="text-center">
              <p className="text-[15px] text-ink-600">{t("memberDetail.resetIssued", { name })}</p>
              <p className="my-3 select-all rounded-[16px] bg-ink-950 py-4 font-display text-[40px] font-extrabold tracking-[0.18em] text-volt">{state.data.code}</p>
              <p className="text-[14px] text-ink-600">{t("memberDetail.resetValid", { time: fmtTime(state.data.expires, lang) })}</p>
            </div>
          ) : (
            <>
              <input type="hidden" name="memberId" value={memberId} />
              <FormError state={state} />
              <SubmitButton pendingLabel={t("common.saving")} variant="dark">
                <KeyRound className="size-5" aria-hidden />
                {t("memberDetail.resetCode")}
              </SubmitButton>
            </>
          )
        }
      </SheetForm>
    </Sheet>
  );
}
