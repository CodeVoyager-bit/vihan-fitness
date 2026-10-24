import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSession, destroySession, type SessionUser, userForToken } from "./accounts";
import { ensureBillingCurrent } from "./ledger";

// Data access layer: every page, server action and export calls one of these guards.
// Access is decided here on the server from the session — never from what the client sends.

const COOKIE = "vf_session";

export const getUser = cache(async (): Promise<SessionUser | null> => userForToken((await cookies()).get(COOKIE)?.value));

export async function startSession(userId: number) {
  const { token, expires } = createSession(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) destroySession(token);
  jar.delete(COOKIE);
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect(u.status === "approved" ? "/app" : "/pending");
  ensureBillingCurrent();
  return u;
}

/** Approved members only. Pending or rejected accounts never reach member data. */
export async function requireMember(next?: string): Promise<SessionUser> {
  const u = await requireUser(next);
  if (u.role === "admin") redirect("/admin");
  if (u.status !== "approved") redirect("/pending");
  ensureBillingCurrent();
  return u;
}

export const homeFor = (u: SessionUser) => (u.role === "admin" ? "/admin" : u.status === "approved" ? "/app" : "/pending");

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}
