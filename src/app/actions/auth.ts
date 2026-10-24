"use server";

import { redirect } from "next/navigation";
import { authenticate, redeemResetCode, registerMember } from "@/lib/accounts";
import { type Result, run, str } from "@/lib/action";
import { AppError, db, isDemo } from "@/lib/db";
import { clientIp, homeFor, startSession, getUser } from "@/lib/session";
import { rateLimit } from "@/lib/accounts";

// Only same-site relative paths are allowed as post-login destinations.
// "//x" and "/\\x" are protocol-relative in browsers, so both are refused.
const safeNext = (n: string) => (/^\/(?![\/\\])/.test(n) ? n : null);

export async function loginAction(_: Result | null, fd: FormData): Promise<Result> {
  const res = await run(async () => {
    const id = await authenticate(str(fd, "phone"), String(fd.get("password") ?? ""), await clientIp());
    await startSession(id);
  }, fd);
  if (!res.ok) return res;
  const u = (await getUser())!;
  redirect((u.role === "member" && u.status === "approved" && safeNext(str(fd, "next"))) || homeFor(u));
}

export async function registerAction(_: Result | null, fd: FormData): Promise<Result> {
  const res = await run(async () => {
    if (String(fd.get("password")) !== String(fd.get("confirm"))) throw new AppError("passwordMismatch", "confirm");
    if (!rateLimit(`register:${await clientIp()}`, 8, 60 * 60)) throw new AppError("tooManyAttempts");
    const id = await registerMember({ name: str(fd, "name"), phone: str(fd, "phone"), password: String(fd.get("password") ?? ""), language: str(fd, "language") });
    await startSession(id);
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
  const u = phone && (db().prepare("SELECT id FROM users WHERE phone = ?").get(phone) as { id: number } | undefined);
  if (!u) throw new AppError("demoOnly");
  await startSession(u.id);
  redirect(role === "admin" ? "/admin" : role === "member" ? "/app" : "/pending");
}
