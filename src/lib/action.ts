import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "./db";

export type Result<T = unknown> =
  | { ok: true; data?: T; at?: number }
  | { ok: false; error: string; field?: string; at?: number; values?: Record<string, string> };

/**
 * Runs a server action body: expected failures become `{ ok:false, error }`, unexpected ones are logged.
 * On failure the submitted fields (never passwords) come back, because React resets the form after an
 * action and people shouldn't have to retype everything.
 */
export async function run<T>(fn: () => T | Promise<T>, fd?: FormData): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn(), at: Date.now() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    const values = fd ? Object.fromEntries([...fd].filter(([k, v]) => typeof v === "string" && !/password|confirm|current|^\$/i.test(k))) as Record<string, string> : undefined;
    if (e instanceof AppError) return { ok: false, error: e.code, field: e.field, at: Date.now(), values };
    console.error(e);
    return { ok: false, error: "somethingWrong", at: Date.now(), values };
  }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const int = (fd: FormData, k: string) => {
  const n = Number(fd.get(k));
  return Number.isInteger(n) ? n : NaN;
};
/** "1,500.50" rupees → 150050 paise. */
export function paise(fd: FormData, k: string): number {
  const raw = str(fd, k).replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new AppError("amountInvalid", k);
  return Math.round(Number(raw) * 100);
}
