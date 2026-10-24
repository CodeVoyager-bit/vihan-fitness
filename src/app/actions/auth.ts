"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, rateLimit, redeemResetCode, registerMember, signInDemo } from "@/lib/accounts";
import { type Result, run, str } from "@/lib/action";
import { AppError, isDemo } from "@/lib/db";
import { clientIp, homeFor } from "@/lib/session";

// Only same-site relative paths are allowed as post-login destinations.
// Same-site paths only. Browsers drop tabs/newlines and treat "\\" like "/", so "/\t/evil" or
// "/\\evil" would become protocol-relative: reject control characters and backslashes, then resolve.
function safeNext(n: string): string | null {
  if (!n.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(n)) return null;
  try {
    const u = new URL(n, "http://same.invalid");
    return u.origin === "http://same.invalid" ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

export async function loginAction(_: Result | null, fd: FormData): Promise<Result> {
  const res = await run(async () => authenticate(str(fd, "phone"), String(fd.get("password") ?? ""), await clientIp(), await headers()), fd);
  if (!res.ok) return res;
  // The new session cookie isn't part of this request yet, so go by the user that just signed in.
  const u = res.data!;
  redirect((u.role === "member" && u.status === "approved" && safeNext(str(fd, "next"))) || homeFor(u));
}

export async function registerAction(_: Result | null, fd: FormData): Promise<Result> {
  const res = await run(async () => {
    if (String(fd.get("password")) !== String(fd.get("confirm"))) throw new AppError("passwordMismatch", "confirm");
    if (!await rateLimit(`register:${await clientIp()}`, 8, 60 * 60)) throw new AppError("tooManyAttempts");
    await registerMember({ name: str(fd, "name"), phone: str(fd, "phone"), password: String(fd.get("password") ?? ""), language: str(fd, "language") }, await headers());
  }, fd);
  if (!res.ok) return res;
  redirect("/pending");
}

export async function resetAction(_: Result | null, fd: FormData): Promise<Result> {
  return run(async () => {
    if (String(fd.get("password")) !== String(fd.get("confirm"))) throw new AppError("passwordMismatch", "confirm");
    await redeemResetCode(str(fd, "phone"), str(fd, "code"), String(fd.get("password") ?? ""), await clientIp());
  }, fd);
}

/** Demo mode only: one-tap sign-in to the seeded demo accounts. Refused on live data. */
export async function demoLoginAction(fd: FormData) {
  if (!isDemo()) throw new AppError("demoOnly");
  const role = str(fd, "as");
  const phone = { admin: "+919000000001", member: "+919000000010", pending: "+919000000090" }[role];
  if (!phone) throw new AppError("demoOnly");
  await signInDemo(phone, await headers());
  redirect(role === "admin" ? "/admin" : role === "member" ? "/app" : "/pending");
}
