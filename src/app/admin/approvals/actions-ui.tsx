"use client";

import { Check, X } from "lucide-react";
import { approveAction, rejectRegistrationAction } from "@/app/actions/admin";
import { FormError, Sheet, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, btn, cx, inputCls } from "@/components/ui";
import { fmtMonth } from "@/lib/format";

export function Approve({ userId, name, months, defaultMonth, fee }: { userId: number; name: string; months: string[]; defaultMonth: string; fee: string }) {
  const { t, lang } = useI18n();
  return (
    <Sheet
      title={t("approvals.approveTitle", { name })}
      description={t("approvals.sub")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "primary", size: "md", block: true })}>
          <Check className="size-5" strokeWidth={3} aria-hidden />
          {t("approvals.approve")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={approveAction} successMessage={t("approvals.approved", { name })} onDone={close}>
          {(state) => <ApproveFields state={state} userId={userId} months={months} defaultMonth={defaultMonth} fee={fee} lang={lang} />}
        </SheetForm>
      )}
    </Sheet>
  );
}

function ApproveFields({ state, userId, months, defaultMonth, fee, lang }: { state: Parameters<typeof useFieldError>[0]; userId: number; months: string[]; defaultMonth: string; fee: string; lang: "en" | "mr" | "hi" }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <input type="hidden" name="userId" value={userId} />
      <FormError state={state} fields={["billingStartMonth", "openingAmount", "openingNote"]} />
      <Field label={t("approvals.billingStart")} htmlFor="bsm" hint={t("approvals.billingStartHelp", { fee })} error={err("billingStartMonth")}>
        <select id="bsm" name="billingStartMonth" defaultValue={defaultMonth} className={inputCls}>
          {months.map((m) => (
            <option key={m} value={m}>
              {fmtMonth(m, lang, "long")}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="space-y-3 rounded-[16px] border border-sand-200 p-3.5">
        <legend className="px-1 text-[15px] font-semibold text-ink-900">
          {t("approvals.openingDues")} <span className="text-[13px] font-normal text-ink-500">({t("common.optional")})</span>
        </legend>
        <p className="-mt-1 text-[13px] text-ink-500">{t("approvals.openingDuesHelp")}</p>
        <Field label={t("common.amount")} htmlFor="oa" error={err("openingAmount")}>
          <input id="oa" name="openingAmount" inputMode="decimal" placeholder="0" className={inputCls} />
        </Field>
        <Field label={t("approvals.openingNote")} htmlFor="on" error={err("openingNote")}>
          <input id="on" name="openingNote" maxLength={200} className={inputCls} />
        </Field>
      </fieldset>
      <SubmitButton pendingLabel={t("common.saving")}>{t("approvals.approveDo")}</SubmitButton>
    </>
  );
}

export function RejectRegistration({ userId, name }: { userId: number; name: string }) {
  const { t } = useI18n();
  return (
    <Sheet
      title={t("approvals.rejectTitle", { name })}
      trigger={(open) => (
        <button type="button" onClick={open} className={cx(btn({ variant: "secondary", size: "md" }), "text-bad")}>
          <X className="size-5" aria-hidden />
          {t("approvals.reject")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={rejectRegistrationAction} successMessage={t("settings.saved")} onDone={close}>
          {(state) => (
            <>
              <input type="hidden" name="userId" value={userId} />
              <FormError state={state} fields={[]} />
              <Field label={t("common.reason")} htmlFor="rr">
                <textarea id="rr" name="reason" rows={2} required maxLength={300} placeholder={t("approvals.rejectPlaceholder")} className={cx(inputCls, "resize-none")} />
              </Field>
              <SubmitButton pendingLabel={t("common.saving")} variant="danger">
                {t("approvals.reject")}
              </SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}
