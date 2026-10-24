"use client";

import { useActionState } from "react";
import { Banknote, CircleEllipsis, Hourglass, Smartphone } from "lucide-react";
import { submitClaimAction } from "@/app/actions/member";
import { FormError, SubmitButton, useFieldError, useKept } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { ButtonLink, Field, Segmented, cx, inputCls } from "@/components/ui";
import { money } from "@/lib/format";

export function ClaimForm({ today, suggested, methods }: { today: string; suggested: number; methods: ("cash" | "upi" | "other")[] }) {
  const { t, lang } = useI18n();
  const [state, action] = useActionState(submitClaimAction, null);
  const err = useFieldError(state);
  const kept = useKept(state);
  if (state?.ok)
    return (
      <div className="animate-rise pt-4 text-center" role="status">
        <span className="animate-pop mx-auto grid size-24 place-items-center rounded-full bg-info-soft text-info">
          <Hourglass className="size-11" aria-hidden />
        </span>
        <h2 className="mt-5 font-display text-[36px] font-extrabold leading-[1.05] text-ink-950">{t("claimForm.sentTitle")}</h2>
        <p className="mx-auto mt-3 max-w-sm text-[17px] text-ink-700">{t("claimForm.sentBody", { amount: money(state.data?.amount ?? 0, lang) })}</p>
        <ButtonLink href="/app/fees" variant="dark" block className="mx-auto mt-6 max-w-sm">
          {t("claimForm.backToFees")}
        </ButtonLink>
      </div>
    );
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} fields={["amount", "paidOn"]} />
      <Field label={t("claimForm.amount")} htmlFor="amount" error={err("amount")}>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-[28px] font-bold text-ink-400">₹</span>
          <input id="amount" name="amount" inputMode="decimal" defaultValue={kept("amount", suggested || "")} required className="block min-h-16 w-full rounded-[18px] border border-sand-300 bg-white pl-10 pr-4 font-display text-[34px] font-bold tabular focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40" />
        </div>
      </Field>
      <Field label={t("claimForm.paidOn")} htmlFor="paidOn" error={err("paidOn")}>
        <input id="paidOn" name="paidOn" type="date" max={today} defaultValue={kept("paidOn", today)} required className={inputCls} />
      </Field>
      <Segmented
        name="method"
        legend={t("claimForm.method")}
        defaultValue={kept("method", methods.includes("upi") ? "upi" : methods[0])}
        options={[
          { value: "upi", label: t("methods.upi"), icon: Smartphone },
          { value: "cash", label: t("methods.cash"), icon: Banknote },
          { value: "other", label: t("methods.other"), icon: CircleEllipsis },
        ].filter((o) => methods.includes(o.value as "cash" | "upi" | "other"))}
      />
      <Field label={t("claimForm.reference")} htmlFor="reference" hint={t("claimForm.referenceHint")} optional optionalLabel={t("common.optional")}>
        <input id="reference" name="reference" defaultValue={kept("reference")} maxLength={60} autoComplete="off" className={inputCls} />
      </Field>
      <Field label={t("claimForm.note")} htmlFor="note" optional optionalLabel={t("common.optional")}>
        <textarea id="note" name="note" defaultValue={kept("note")} rows={2} maxLength={300} className={cx(inputCls, "resize-none")} />
      </Field>
      <SubmitButton pendingLabel={t("claimForm.submitting")}>{t("claimForm.submit")}</SubmitButton>
    </form>
  );
}
