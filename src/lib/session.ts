import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type SessionUser, ipKey, signOut, userForHeaders } from "./accounts";
import { ensureBillingCurrent } from "./ledger";

// Data access layer: every page, server action and export calls one of these guards.
// Access is decided here on the server from the session — never from what the client sends.
// Signing in happens in accounts.ts (Better Auth sets the session cookie).

export const getUser = cache(async (): Promise<SessionUser | null> => {
  // cookies() includes a session cookie set earlier in this server action (sign-in, password change),
  // which the raw request headers don't have yet.
  const h = new Headers(await headers());
  h.set("cookie", (await cookies()).toString());
  return userForHeaders(h);
});

export async function endSession() {
  await signOut(await headers());
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect(u.status === "approved" ? "/app" : "/pending");
  await ensureBillingCurrent();
  return u;
}

/** Approved members only. Pending or rejected accounts never reach member data. */
export async function requireMember(next?: string): Promise<SessionUser> {
  const u = await requireUser(next);
  if (u.role === "admin") redirect("/admin");
  if (u.status !== "approved") redirect("/pending");
  await ensureBillingCurrent();
  return u;
}

export const homeFor = (u: SessionUser) => (u.role === "admin" ? "/admin" : u.status === "approved" ? "/app" : "/pending");

/**
 * The client address as seen by our reverse proxy. Proxies append to X-Forwarded-For, so the last
 * hop is the one the proxy wrote; earlier entries are whatever the client sent and can't be trusted.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const hops = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return ipKey((hops.at(-1) || h.get("x-real-ip") || "local").slice(0, 64));
}
