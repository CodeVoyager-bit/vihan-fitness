"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Banknote, CircleEllipsis, Hourglass, Loader2, Paperclip, Smartphone, X } from "lucide-react";
import { submitClaimAction } from "@/app/actions/member";
import { FormError, SubmitButton, shrinkPhoto, useFieldError, useKept } from "@/components/client";
import { useI18n } from "@/components/i18n-provider";
import { ButtonLink, Field, Segmented, btn, cx, inputCls } from "@/components/ui";
import { MAX_PHOTO_BYTES, money } from "@/lib/format";

type Method = "cash" | "upi" | "other";

/** `proofEnabled`: photo uploads are set up (CLOUDINARY_URL), so UPI claims can carry a screenshot. */
export function ClaimForm({ today, suggested, methods, proofEnabled }: { today: string; suggested: number; methods: Method[]; proofEnabled: boolean }) {
  const { t, lang } = useI18n();
  const [state, action] = useActionState(submitClaimAction, null);
  const err = useFieldError(state);
  const kept = useKept(state);
  const [method, setMethod] = useState(() => kept("method", methods.includes("upi") ? "upi" : methods[0]) as Method);
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
      <FormError state={state} fields={["amount", "paidOn", "proof"]} />
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
        value={method}
        onChange={(v) => setMethod(v as Method)}
        options={[
          { value: "upi", label: t("methods.upi"), icon: Smartphone },
          { value: "cash", label: t("methods.cash"), icon: Banknote },
          { value: "other", label: t("methods.other"), icon: CircleEllipsis },
        ].filter((o) => methods.includes(o.value as Method))}
      />
      {/* A failed save resets the form (and its file), so the field starts over with it. */}
      {method === "upi" && proofEnabled && <ProofField key={state && !state.ok ? state.at : "proof"} error={err("proof")} />}
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

/** Optional UPI screenshot: shrunk on the phone to a ~1600px JPEG, previewed, sent with the claim. */
function ProofField({ error }: { error: string | null }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tooBig, setTooBig] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const clear = () => {
    if (input.current) input.current.value = "";
    setPreview(null);
  };
  return (
    <div>
      <p className="text-[15px] font-semibold text-ink-900">
        {t("claimForm.proof")} <span className="font-normal text-ink-500">({t("common.optional")})</span>
      </p>
      <p className="mb-2 text-[14px] text-ink-600">{t("claimForm.proofHint")}</p>
      {preview && (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL), not a served image */}
          <img src={preview} alt={t("claimForm.proofAlt")} className="h-40 w-auto max-w-[60%] rounded-[12px] border border-sand-300 bg-sand-100 object-contain" />
          <button type="button" onClick={clear} className={btn({ variant: "ghost", size: "sm" })}>
            <X className="size-4" aria-hidden />
            {t("claimForm.proofRemove")}
          </button>
        </div>
      )}
      <label hidden={!!preview} className={cx(btn({ variant: "secondary", size: "md" }), "cursor-pointer focus-within:ring-4 focus-within:ring-volt/40", busy && "pointer-events-none opacity-60")}>
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Paperclip className="size-5" aria-hidden />}
        {t("claimForm.proofAdd")}
        <input
          ref={input}
          type="file"
          name="proof"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const el = e.currentTarget;
            const file = el.files?.[0];
            setTooBig(false);
            if (!file) return setPreview(null);
            setBusy(true);
            const small = await shrinkPhoto(file);
            setBusy(false);
            if (small.size > MAX_PHOTO_BYTES) {
              el.value = "";
              return setTooBig(true);
            }
            // Put the shrunk copy back into the input, so the normal form submit sends it.
            const out = new File([small], "screenshot.jpg", { type: small.type || file.type });
            const dt = new DataTransfer();
            dt.items.add(out);
            el.files = dt.files;
            setPreview(URL.createObjectURL(out));
          }}
        />
      </label>
      {(error || tooBig) && <p className="mt-1.5 text-[14px] font-medium text-bad">{error ?? t("errors.photoInvalid")}</p>}
    </div>
  );
}
