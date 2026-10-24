"use client";

import { Check, Link2, X } from "lucide-react";
import { confirmClaimAction, linkClaimAction, rejectClaimAction } from "@/app/actions/admin";
import { FormError, Sheet, SheetForm, SubmitButton, useFieldError } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, KeyValue, btn, cx, inputCls } from "@/components/ui";

export function ConfirmClaim({ claimId, title, lines, balanceAfter }: { claimId: number; title: string; lines: [string, string][]; balanceAfter: string }) {
  const { t } = useI18n();
  return (
    <Sheet
      title={title}
      description={t("claims.confirmHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "primary", size: "md", block: true })}>
          <Check className="size-5" strokeWidth={3} aria-hidden />
          {t("claims.confirm")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={confirmClaimAction} successMessage={t("claims.confirmed")} onDone={close}>
          {(state) => (
            <>
              <input type="hidden" name="claimId" value={claimId} />
              <FormError state={state} />
              <KeyValue items={[...lines, [t("pay.balanceAfter"), balanceAfter]]} />
              <SubmitButton pendingLabel={t("pay.saving")}>{t("claims.confirm")}</SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

export function LinkClaim({ claimId, paymentId, summary }: { claimId: number; paymentId: number; summary: string }) {
  const { t } = useI18n();
  return (
    <Sheet
      title={t("claims.linkTitle")}
      description={t("claims.linkHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={btn({ variant: "secondary", size: "sm" })}>
          <Link2 className="size-4" aria-hidden />
          {t("claims.link")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={linkClaimAction} successMessage={t("claims.linked")} onDone={close}>
          {(state) => (
            <>
              <input type="hidden" name="claimId" value={claimId} />
              <input type="hidden" name="paymentId" value={paymentId} />
              <FormError state={state} />
              <p className="rounded-[14px] bg-sand-100 px-4 py-3 text-[15px] font-semibold">{summary}</p>
              <SubmitButton pendingLabel={t("common.saving")} variant="dark">
                {t("claims.link")}
              </SubmitButton>
            </>
          )}
        </SheetForm>
      )}
    </Sheet>
  );
}

export function RejectClaim({ claimId }: { claimId: number }) {
  const { t } = useI18n();
  return (
    <Sheet
      title={t("claims.rejectTitle")}
      description={t("claims.rejectHelp")}
      trigger={(open) => (
        <button type="button" onClick={open} className={cx(btn({ variant: "secondary", size: "md" }), "text-bad")}>
          <X className="size-5" aria-hidden />
          {t("claims.reject")}
        </button>
      )}
    >
      {(close) => (
        <SheetForm action={rejectClaimAction} successMessage={t("claims.rejected")} onDone={close}>
          {(state) => <RejectFields state={state} claimId={claimId} />}
        </SheetForm>
      )}
    </Sheet>
  );
}

function RejectFields({ state, claimId }: { state: Parameters<typeof useFieldError>[0]; claimId: number }) {
  const { t } = useI18n();
  const err = useFieldError(state);
  return (
    <>
      <input type="hidden" name="claimId" value={claimId} />
      <FormError state={state} fields={["reason"]} />
      <Field label={t("common.reason")} htmlFor="reason" error={err("reason")}>
        <textarea id="reason" name="reason" rows={3} required maxLength={300} placeholder={t("claims.rejectPlaceholder")} className={cx(inputCls, "resize-none")} />
      </Field>
      <SubmitButton pendingLabel={t("common.saving")} variant="danger">
        {t("claims.reject")}
      </SubmitButton>
    </>
  );
}
