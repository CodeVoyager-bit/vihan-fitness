"use client";

import { Check, CheckCheck } from "lucide-react";
import { helpAction } from "@/app/actions/admin";
import { FormError, Sheet, SheetForm, SubmitButton } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { Field, btn, cx, inputCls } from "@/components/ui";

export function HelpActions({ id, status }: { id: number; status: "open" | "acknowledged" }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["acknowledged", "resolved"] as const).map((s) => (
        <Sheet
          key={s}
          title={s === "acknowledged" ? t("help.acknowledge") : t("help.resolve")}
          trigger={(open) => (
            <button type="button" onClick={open} disabled={s === "acknowledged" && status === "acknowledged"} className={btn({ variant: s === "resolved" ? "primary" : "secondary", size: "md", block: true })}>
              {s === "acknowledged" ? <Check className="size-5" aria-hidden /> : <CheckCheck className="size-5" aria-hidden />}
              {s === "acknowledged" ? t("help.acknowledge") : t("help.resolve")}
            </button>
          )}
        >
          {(close) => (
            <SheetForm action={helpAction} successMessage={t("settings.saved")} onDone={close}>
              {(state) => (
                <>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value={s} />
                  <FormError state={state} />
                  <Field label={t("common.note")} htmlFor={`n-${s}`} optional optionalLabel={t("common.optional")}>
                    <textarea id={`n-${s}`} name="note" rows={3} maxLength={300} placeholder={t("help.notePlaceholder")} className={cx(inputCls, "resize-none")} />
                  </Field>
                  <SubmitButton pendingLabel={t("common.saving")}>{s === "acknowledged" ? t("help.acknowledge") : t("help.resolve")}</SubmitButton>
                </>
              )}
            </SheetForm>
          )}
        </Sheet>
      ))}
    </div>
  );
}
