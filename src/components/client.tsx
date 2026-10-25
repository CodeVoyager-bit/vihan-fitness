"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Check, Eye, EyeOff, Loader2, MessageCircle, WifiOff, X, FlaskConical } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { btn, cx, Notice } from "./ui";
import type { Lang, TKey } from "@/lib/i18n";
import type { Result } from "@/lib/action";
import { MAX_PHOTO_BYTES } from "@/lib/format";
import { logReminderAction, setLanguageAction } from "@/app/actions/common";

// ───────────────────────────── feedback ─────────────────────────────

export function DemoBanner() {
  const { t } = useI18n();
  return (
    <div className="no-print flex items-center justify-center gap-2 bg-ink-950 px-4 py-1.5 text-center text-[13px] font-medium text-volt">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      {t("common.demoBanner")}
    </div>
  );
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function OfflineBanner() {
  const { t } = useI18n();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="no-print sticky top-0 z-[60] flex items-center justify-center gap-2 bg-warn px-4 py-2 text-[14px] font-semibold text-white">
      <WifiOff className="size-4" aria-hidden />
      {t("common.offline")}
    </div>
  );
}

const TOAST_EVENT = "vf-toast";
export const toast = (message: string) => window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const id = Date.now();
      setItems((s) => [...s, { id, message: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3800);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-8">
      {items.map((i) => (
        <div key={i.id} className="animate-rise flex items-center gap-2 rounded-full bg-ink-900 py-2.5 pl-3 pr-4 text-[15px] font-medium text-sand-0 shadow-[var(--shadow-lift)]">
          <span className="grid size-5 place-items-center rounded-full bg-volt text-ink-950">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
          {i.message}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── forms ─────────────────────────────

export function SubmitButton({ children, pendingLabel, variant = "primary", size = "lg", block = true, className, disabled, name, value }: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "dark" | "secondary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending} className={cx(btn({ variant, size, block }), className)}>
      {pending ? (
        <>
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export type ActionFn<T = unknown> = (prev: Result<T> | null, fd: FormData) => Promise<Result<T>>;

/** Translated error for a field, if the last action failed on it. */
export function useFieldError(state: Result<unknown> | null) {
  const { t } = useI18n();
  return (field: string) => (state && !state.ok && state.field === field ? t(`errors.${state.error}` as TKey) : null);
}

export function FormError({ state, fields = [] }: { state: Result<unknown> | null; fields?: string[] }) {
  const { t } = useI18n();
  if (!state || state.ok || (state.field && fields.includes(state.field))) return null;
  const key = state.error === "somethingWrong" ? "common.somethingWrong" : `errors.${state.error}`;
  return <Notice tone="bad">{t(key as TKey)}</Notice>;
}

export function PasswordInput({ id, name, autoComplete, invalid, describedBy }: { id: string; name: string; autoComplete: string; invalid?: boolean; describedBy?: string }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={8}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="block min-h-12 w-full rounded-[14px] border border-sand-300 bg-white py-2.5 pl-3.5 pr-12 text-[16px] text-ink-950 transition focus:border-ink-900 focus:outline-none focus:ring-4 focus:ring-volt/40 aria-[invalid=true]:border-bad"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-[14px] text-ink-500 hover:text-ink-900"
      >
        {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}

// ───────────────────────────── sheet (native <dialog>) ─────────────────────────────

export function Sheet({
  title,
  description,
  trigger,
  children,
  defaultOpen,
}: {
  title: string;
  description?: string;
  trigger?: (open: () => void) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [mounted, setMounted] = useState(!!defaultOpen);
  // Swipe down on the grabber/header to dismiss (the close button stays as the non-gesture way out).
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!ref.current || !d) return;
    ref.current.style.transition = "transform 200ms var(--ease-out)";
    ref.current.style.transform = d.dy > 90 ? "translateY(100%)" : "";
    setTimeout(() => {
      if (!ref.current) return;
      if (d.dy > 90) ref.current.close();
      ref.current.style.transition = "";
      ref.current.style.transform = "";
    }, 200);
  };
  const open = () => {
    setMounted(true);
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const close = () => ref.current?.close();
  useEffect(() => {
    if (defaultOpen) ref.current?.showModal();
  }, [defaultOpen]);
  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- open() only reads the ref when the trigger is clicked */}
      {trigger?.(open)}
      <dialog
        ref={ref}
        className="sheet"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={(e) => e.target === ref.current && close()}
        onClose={() => setMounted(false)}
      >
        {mounted && (
          <div className="max-h-[92dvh] overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
            <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="-mx-5 -mt-3 touch-none px-5 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-sand-300 sm:hidden" aria-hidden />
            </div>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id={`${id}-t`} className="font-display text-[26px] font-extrabold leading-[1.05] text-ink-950">
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-d`} className="mt-1.5 text-[15px] text-ink-600">
                    {description}
                  </p>
                )}
              </div>
              <button type="button" onClick={close} aria-label={t("common.close")} className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-600 hover:bg-sand-200">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {/* eslint-disable-next-line react-hooks/refs -- close() only reads the ref when called from an event */}
            {typeof children === "function" ? children(close) : children}
          </div>
        )}
      </dialog>
    </>
  );
}

/** A form inside a sheet: closes, toasts and refreshes once the server confirms the save. */
export function SheetForm<T>({
  action,
  children,
  successMessage,
  onDone,
  className,
}: {
  action: ActionFn<T>;
  children: (state: Result<T> | null) => React.ReactNode;
  successMessage?: string;
  onDone?: (state: Result<T>) => void;
  className?: string;
}) {
  // The toast fires here, not in an effect: saving can remove this very item (a confirmed claim, an
  // approved registration) and unmount the form before any effect runs. A dropped connection becomes
  // an error message instead of crashing the page.
  const [state, formAction] = useActionState(async (prev: Result<T> | null, fd: FormData): Promise<Result<T>> => {
    let r: Result<T>;
    try {
      r = await action(prev, fd);
    } catch {
      r = { ok: false, error: "network", at: Date.now() };
    }
    if (r.ok && successMessage) toast(successMessage);
    return r;
  }, null);
  const last = useRef<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && state.at !== last.current) {
      last.current = state.at;
      onDone?.(state);
    }
  }, [state, onDone]);
  // React resets the form after the action; put back what was typed when the save failed.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !state || state.ok || !state.values) return;
    const values = state.values;
    // The reset runs after this commit, so restore on the next frame.
    const id = requestAnimationFrame(() => {
      for (const [k, v] of Object.entries(values)) {
        const el = form.elements.namedItem(k);
        if (el instanceof RadioNodeList) el.value = v;
        else if ((el instanceof HTMLInputElement && !["hidden", "checkbox"].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.value = v;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [state]);
  return (
    <form ref={formRef} action={formAction} noValidate className={cx("space-y-4", className)}>
      {children(state)}
    </form>
  );
}

// ───────────────────────────── language ─────────────────────────────

export function LangSwitcher({ dark, className }: { dark?: boolean; className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const opts: { v: Lang; short: string }[] = [
    { v: "en", short: "EN" },
    { v: "mr", short: "मरा" },
    { v: "hi", short: "हिं" },
  ];
  return (
    <div role="group" aria-label={t("common.language")} className={cx("inline-flex rounded-full p-1", dark ? "bg-white/10" : "bg-sand-200/80", pending && "opacity-60", className)}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          lang={o.v}
          aria-pressed={lang === o.v}
          title={t(`langs.${o.v}`)}
          onClick={() =>
            start(async () => {
              await setLanguageAction(o.v);
              router.refresh();
            })
          }
          className={cx(
            "min-h-11 min-w-11 rounded-full px-2.5 text-[14px] font-semibold transition-colors",
            lang === o.v ? (dark ? "bg-volt text-ink-950" : "bg-ink-900 text-sand-0") : dark ? "text-white/75 hover:text-white" : "text-ink-600 hover:text-ink-900",
          )}
        >
          {o.short}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────── WhatsApp ─────────────────────────────

/**
 * Previews a prefilled message in any language, then opens WhatsApp. Bharat presses Send himself,
 * so the app only ever records that WhatsApp was *opened*.
 */
export function WhatsAppSheet({
  memberId,
  name,
  waNumber,
  messages,
  defaultLang,
  kind,
  lastOpenedLabel,
  claimWarning,
  claimHref,
  label,
  variant = "icon",
  autoOpen,
}: {
  memberId: number;
  name: string;
  waNumber: string | null;
  messages: Record<Lang, string>;
  defaultLang: Lang;
  kind: "fee" | "attendance" | "receipt";
  lastOpenedLabel?: string;
  claimWarning?: string | null;
  claimHref?: string;
  label: string;
  variant?: "icon" | "button" | "block";
  autoOpen?: boolean;
}) {
  const { t } = useI18n();
  const [lang, setLang] = useState<Lang>(defaultLang);
  // Bharat can reword the message per language before opening WhatsApp; edits are kept per language.
  const [drafts, setDrafts] = useState<Partial<Record<Lang, string>>>({});
  const text = drafts[lang] ?? messages[lang];
  const edited = drafts[lang] !== undefined && drafts[lang] !== messages[lang];
  const trigger = (open: () => void) =>
    variant === "icon" ? (
      <button type="button" onClick={open} aria-label={label} title={label} className="grid size-11 shrink-0 place-items-center rounded-full bg-[#e3f6e8] text-[#126b3a] transition hover:bg-[#cdeed6] active:scale-95">
        <MessageCircle className="size-5" aria-hidden />
      </button>
    ) : (
      <button type="button" onClick={open} className={cx(btn({ variant: "secondary", size: variant === "block" ? "md" : "sm", block: variant === "block" }), "text-[#126b3a]")}>
        <MessageCircle className="size-[18px]" aria-hidden />
        {label}
      </button>
    );
  const [override, setOverride] = useState(false);
  const blocked = !!claimWarning && !override;
  const href = `https://wa.me/${waNumber ?? ""}?text=${encodeURIComponent(text.trim())}`;
  useEffect(() => {
    if (!autoOpen) return;
    const u = new URL(location.href);
    u.searchParams.delete("wa");
    history.replaceState(history.state, "", u);
  }, [autoOpen]);
  return (
    <Sheet title={t("whatsapp.previewTitle")} description={t("whatsapp.previewHelp")} trigger={trigger} defaultOpen={autoOpen}>
      {(close) => (
        <div className="space-y-4">
          {claimWarning && !override && (
            <Notice tone="warn" icon={AlertTriangle}>
              <p className="font-semibold">{claimWarning}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {claimHref && (
                  <a href={claimHref} className={btn({ variant: "dark", size: "sm" })}>
                    {t("whatsapp.reviewClaim")}
                  </a>
                )}
                <button type="button" onClick={() => setOverride(true)} className={btn({ variant: "secondary", size: "sm" })}>
                  {t("whatsapp.sendAnyway")}
                </button>
              </div>
            </Notice>
          )}
          <div role="group" aria-label={t("common.language")} className="flex gap-1.5">
            {(["en", "mr", "hi"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={cx("min-h-10 rounded-full px-4 text-[14px] font-semibold transition", lang === l ? "bg-ink-900 text-sand-0" : "bg-sand-200/80 text-ink-700")}
              >
                {t(`langs.${l}`)}
              </button>
            ))}
          </div>
          <div className="rounded-[18px] bg-[#e9e2d5] p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="wa-text" className="text-[13px] font-semibold text-ink-600">
                {t("whatsapp.messageLabel")} · {name}
              </label>
              {edited && (
                <button type="button" onClick={() => setDrafts((d) => ({ ...d, [lang]: undefined }))} className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-950">
                  {t("whatsapp.resetTemplate")}
                </button>
              )}
            </div>
            <textarea
              id="wa-text"
              lang={lang}
              value={text}
              onChange={(e) => setDrafts((d) => ({ ...d, [lang]: e.target.value }))}
              rows={5}
              maxLength={1000}
              spellCheck
              className="mt-1.5 block w-full resize-y rounded-[14px] rounded-tl-[4px] border-0 bg-[#d9fdd3] px-3.5 py-2.5 text-[16px] leading-relaxed text-ink-950 shadow-sm focus:outline-none focus:ring-4 focus:ring-[#128c4a]/30"
            />
            <p className="mt-1.5 flex items-center justify-between text-[12px] text-ink-500">
              <span>{edited ? t("whatsapp.edited") : ""}</span>
              <span className="tabular">{text.length}/1000</span>
            </p>
          </div>
          {lastOpenedLabel && <p className="text-[13px] text-ink-500">{lastOpenedLabel}</p>}
          {!waNumber && <p className="text-[13px] font-medium text-warn">{t("whatsapp.demoNote")}</p>}
          <a
            href={blocked || !text.trim() ? undefined : href}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={blocked || !text.trim()}
            onClick={() => {
              if (blocked || !text.trim()) return;
              void logReminderAction(memberId, kind, lang);
              setTimeout(close, 300);
            }}
            className={btn({ variant: "whatsapp", size: "lg", block: true })}
          >
            <MessageCircle className="size-5" aria-hidden />
            {t("whatsapp.open")}
          </a>
        </div>
      )}
    </Sheet>
  );
}

/** One-tap actions with consequences get a confirm step. `action` is a server action passed from a server component. */
export function ConfirmAction({
  action,
  fields = {},
  label,
  title,
  body,
  confirmLabel,
  tone = "ghost",
  className,
}: {
  action: (fd: FormData) => Promise<void>;
  fields?: Record<string, string | number>;
  label: string;
  title: string;
  body?: string;
  confirmLabel: string;
  tone?: "ghost" | "danger" | "secondary";
  className?: string;
}) {
  return (
    <Sheet
      title={title}
      description={body}
      trigger={(open) => (
        <button type="button" onClick={open} className={cx(btn({ variant: tone, size: "sm" }), className)}>
          {label}
        </button>
      )}
    >
      {(close) => (
        <form
          action={async (fd) => {
            await action(fd);
            close();
          }}
        >
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SubmitButton variant="dark">{confirmLabel}</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}

/** Value a field should show after a failed action (React resets forms after every action). */
export function useKept(state: Result<unknown> | null) {
  return (name: string, fallback: string | number = "") => (state && !state.ok && state.values?.[name] !== undefined ? state.values[name] : String(fallback));
}

// ───────────────────────────── photos ─────────────────────────────

// Phone photos are 3–8 MB; a 1600px JPEG is a few hundred KB, which matters on mobile data.
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail()), "image/jpeg", 0.85));
  } catch {
    return file; // a format this browser can't draw (e.g. HEIC on desktop): send it as is
  }
}

/** Add / change / remove for one photo. `action` gets a form with `photo`, or without it to remove the photo. */
/** `keepFormat`: send the file as it is when small enough (a logo keeps its transparency instead of becoming a JPEG). */
export function PhotoButtons({ action, has, className, keepFormat }: { action: (fd: FormData) => Promise<Result>; has: boolean; className?: string; keepFormat?: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [state, setState] = useState<Result | null>(null);
  const send = (photo: Blob | null) =>
    start(async () => {
      const fd = new FormData();
      if (photo) fd.set("photo", photo, "photo.jpg");
      setState(await action(fd).catch((): Result => ({ ok: false, error: "photoFailed" })));
    });
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <label className={cx(btn({ variant: "secondary", size: "sm" }), "cursor-pointer focus-within:ring-4 focus-within:ring-volt/40", pending && "pointer-events-none opacity-60")}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {pending ? t("common.saving") : has ? t("common.photoChange") : t("common.photoAdd")}
          <input
            type="file"
            accept="image/*"
            disabled={pending}
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // so picking the same file again still fires
              if (!file) return;
              const photo = keepFormat && file.size <= MAX_PHOTO_BYTES ? file : await shrinkPhoto(file);
              if (photo.size > MAX_PHOTO_BYTES) setState({ ok: false, error: "photoInvalid" });
              else send(photo);
            }}
          />
        </label>
        {has && (
          <button type="button" disabled={pending} onClick={() => send(null)} className={btn({ variant: "ghost", size: "sm" })}>
            {t("common.photoRemove")}
          </button>
        )}
      </div>
      {state && !state.ok && (
        <div className="mt-2">
          <FormError state={state} />
        </div>
      )}
    </div>
  );
}
