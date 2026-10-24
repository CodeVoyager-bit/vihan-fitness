import crypto from "node:crypto";
import { isAPIError } from "better-auth/api";
import { PASSWORD_MIN, auth } from "./auth";
import { AppError, appMode, audit, db, nextId, nowIso } from "./db";
import { normalizePhone } from "./phone";

// Passwords and sessions are Better Auth's (scrypt hashes, random session tokens); this file keeps the
// gym's own rules around them: phone numbers, approval, rate limits and in-person reset codes.

export { PASSWORD_MIN };
export function checkPassword(pw: string) {
  if (pw.length < PASSWORD_MIN || pw.length > 128) throw new AppError("passwordTooShort", "password");
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Better Auth signs in by email. Members only have a phone, so each phone gets a fixed hidden address. */
export const authEmail = (phone: string) => `${phone.replace(/\D/g, "")}@phone.vihan`;

/** The Better Auth error code, if `e` is one. */
const authCode = (e: unknown) => (isAPIError(e) ? (e.body as { code?: string } | undefined)?.code : undefined);

// ───────────────────────────── rate limiting ─────────────────────────────

/**
 * Fixed-window counter in the database. Returns false once `limit` hits within `windowSec`.
 * One atomic upsert, so parallel requests (even on different server instances) can't slip past it.
 */
export async function rateLimit(rawKey: string, limit: number, windowSec: number): Promise<boolean> {
  const key = rawKey.slice(0, 120); // keys include client-supplied values; keep rows small
  const now = Math.floor(Date.now() / 1000);
  const r = await (await db()).rate_limits.findOneAndUpdate(
    { _id: key },
    [
      { $set: { fresh: { $or: [{ $eq: [{ $type: "$window_start" }, "missing"] }, { $gte: [{ $subtract: [now, "$window_start"] }, windowSec] }] } } },
      {
        $set: {
          count: { $cond: ["$fresh", 1, { $add: ["$count", 1] }] },
          window_start: { $cond: ["$fresh", now, "$window_start"] },
          expires_at: { $cond: ["$fresh", new Date((now + windowSec) * 1000), "$expires_at"] }, // TTL cleans up
        },
      },
      { $unset: "fresh" },
    ],
    { upsert: true, returnDocument: "after" },
  );
  return r!.count <= limit;
}

export const clearRateLimit = async (key: string) => void (await (await db()).rate_limits.deleteOne({ _id: key }));

// ───────────────────────────── users ─────────────────────────────

export type Lang = "en" | "mr" | "hi";
export const LANGS: Lang[] = ["en", "mr", "hi"];

export type SessionUser = {
  id: number;
  name: string;
  phone: string;
  role: "admin" | "member";
  status: "pending" | "approved" | "rejected";
  language: Lang;
};

/** The fields the app uses from a Better Auth user (or a `users` document). */
export const sessionUser = (u: { uid: number; name: string; phone: string; role: string; status: string; language: string }): SessionUser => ({
  id: u.uid,
  name: u.name,
  phone: u.phone,
  role: u.role as SessionUser["role"],
  status: u.status as SessionUser["status"],
  language: u.language as Lang,
});

/** Better Auth's id for one of our users. */
async function authId(uid: number): Promise<string> {
  const u = await (await db()).users.findOne({ uid }, { projection: { _id: 1 } });
  if (!u) throw new AppError("memberNotFound");
  return u._id.toHexString();
}

/** Signs the user out everywhere. */
export async function revokeSessions(uid: number) {
  await (await auth().$context).internalAdapter.deleteUserSessions(await authId(uid));
}

/** Replaces the password without the old one (registration after rejection, reset codes, the admin script). */
export async function setPassword(uid: number, password: string) {
  const ctx = await auth().$context;
  await ctx.internalAdapter.updatePassword(await authId(uid), await ctx.password.hash(password));
}

/** Registers a member (pending until Bharat approves) and signs them in. Returns the user id. */
export async function registerMember(input: { name: string; phone: string; password: string; language: string }, headers?: Headers): Promise<number> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new AppError("nameInvalid", "name");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AppError("phoneInvalid", "phone");
  checkPassword(input.password);
  const language = LANGS.includes(input.language as Lang) ? input.language : "en";
  const d = await db();
  const existing = await d.users.findOne({ phone }, { projection: { uid: 1, status: 1 } });
  if (existing && existing.status !== "rejected") {
    await audit(null, "registration.duplicate", { detail: { phone: phone.slice(0, 5) + "•••••" + phone.slice(-2) } });
    throw new AppError("phoneTaken", "phone");
  }
  if (existing) {
    // A rejected number can register again (e.g. it was someone else's attempt); it goes back to Bharat for review.
    await setPassword(existing.uid, input.password);
    await d.users.updateOne(
      { _id: existing._id },
      { $set: { name, language: language as Lang, status: "pending", rejected_reason: null, reviewed_at: null, reviewed_by: null, createdAt: new Date() } },
    );
    await audit(existing.uid, "registration.submitted", { entity: "user", entityId: existing.uid, detail: "re-registered after rejection" });
    await auth().api.signInEmail({ body: { email: authEmail(phone), password: input.password }, headers });
    return existing.uid;
  }
  try {
    const r = await auth().api.signUpEmail({ body: { email: authEmail(phone), password: input.password, name, phone, language }, headers });
    await audit(r.user.uid, "registration.submitted", { entity: "user", entityId: r.user.uid });
    return r.user.uid;
  } catch (e) {
    // Lost a race with a twin submit: the unique phone index refused the second one.
    if (authCode(e) === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || authCode(e) === "FAILED_TO_CREATE_USER") throw new AppError("phoneTaken", "phone");
    throw e;
  }
}

/** Signs in (sets the session cookie). Same error for unknown phone and wrong password. */
export async function authenticate(phoneInput: string, password: string, ip: string, headers?: Headers): Promise<SessionUser> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new AppError("phoneInvalid", "phone");
  // Guesses are limited per phone+IP (so a stranger can't lock the owner out from elsewhere), with
  // looser caps per IP and per phone against spraying from one place or many.
  if (!(await rateLimit(`login:ip:${ip}`, 30, 15 * 60)) || !(await rateLimit(`login:pip:${phone}|${ip}`, 6, 15 * 60)) || !(await rateLimit(`login:phone:${phone}`, 40, 15 * 60)))
    throw new AppError("tooManyAttempts");
  try {
    // Better Auth hashes even for unknown numbers, so timing doesn't reveal which are registered.
    const r = await auth().api.signInEmail({ body: { email: authEmail(phone), password }, headers });
    await clearRateLimit(`login:pip:${phone}|${ip}`);
    return sessionUser(r.user);
  } catch (e) {
    if (authCode(e) === "ACCOUNT_REJECTED") throw new AppError("accountRejected");
    if (authCode(e) === "INVALID_EMAIL_OR_PASSWORD" || authCode(e) === "PASSWORD_TOO_LONG") throw new AppError("badCredentials");
    throw e;
  }
}

/** Changes the password and signs out every other device (this one gets a fresh session). */
export async function changePassword(userId: number, current: string, next: string, headers: Headers) {
  if (!(await rateLimit(`pwchange:${userId}`, 5, 15 * 60))) throw new AppError("tooManyAttempts");
  checkPassword(next);
  try {
    await auth().api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers });
  } catch (e) {
    if (authCode(e) === "INVALID_PASSWORD") throw new AppError("badCurrentPassword", "current");
    throw e;
  }
  await audit(userId, "password.changed", { entity: "user", entityId: userId });
}

export async function signOut(headers: Headers) {
  await auth().api.signOut({ headers });
}

/** The signed-in user for these request headers, or null. */
export async function userForHeaders(headers: Headers): Promise<SessionUser | null> {
  const s = await auth().api.getSession({ headers });
  return s ? sessionUser(s.user) : null;
}

// ───────────────────────────── password reset (no OTP) ─────────────────────────────
// Bharat checks identity in person, then issues a short-lived, single-use code.

const RESET_MINUTES = 30;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L confusion

export async function issueResetCode(userId: number, actorId: number): Promise<{ code: string; expires: Date }> {
  const d = await db();
  // Only member accounts; the admin resets his own password from the command line.
  if (!(await d.users.findOne({ uid: userId, role: "member" }, { projection: { _id: 1 } }))) throw new AppError("memberNotFound");
  let code = "";
  for (const b of crypto.randomBytes(8)) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  const expires = new Date(Date.now() + RESET_MINUTES * 60_000);
  await d.reset_codes.updateMany({ user_id: userId, used_at: null }, { $set: { used_at: nowIso() } }); // one live code at a time
  await d.reset_codes.insertOne({
    _id: await nextId("reset_codes"),
    user_id: userId,
    code_hash: sha256(code),
    expires_at: expires.toISOString(),
    used_at: null,
    attempts: 0,
    created_by: actorId,
    created_at: nowIso(),
  });
  await audit(actorId, "password.reset_issued", { memberId: userId, entity: "user", entityId: userId });
  return { code, expires };
}

export async function redeemResetCode(phoneInput: string, code: string, newPassword: string, ip: string) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new AppError("phoneInvalid", "phone");
  if (!(await rateLimit(`reset:ip:${ip}`, 20, 15 * 60))) throw new AppError("tooManyAttempts");
  checkPassword(newPassword);
  const d = await db();
  const user = await d.users.findOne({ phone }, { projection: { uid: 1 } });
  const row = user && (await d.reset_codes.findOne({ user_id: user.uid, used_at: null, expires_at: { $gt: nowIso() } }, { sort: { _id: -1 } }));
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!user || !row || row.attempts >= 5) throw new AppError("resetCodeInvalid", "code");
  if (!crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(normalized)))) {
    await d.reset_codes.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
    throw new AppError("resetCodeInvalid", "code");
  }
  // Claiming the code first makes it single-use even if two submits race.
  if ((await d.reset_codes.updateOne({ _id: row._id, used_at: null }, { $set: { used_at: nowIso() } })).modifiedCount !== 1) throw new AppError("resetCodeInvalid", "code");
  await setPassword(user.uid, newPassword);
  await revokeSessions(user.uid);
  await audit(user.uid, "password.reset_used", { memberId: user.uid, entity: "user", entityId: user.uid });
  return user.uid;
}

export async function setLanguage(userId: number, lang: string) {
  if (!LANGS.includes(lang as Lang)) throw new AppError("invalidInput");
  await (await db()).users.updateOne({ uid: userId }, { $set: { language: lang as Lang } });
}

// ───────────────────────────── demo ─────────────────────────────

/** Every seeded demo account shares this password (demo database only). */
export const demoPassword = () => process.env.DEMO_PASSWORD || "vihan-demo";

/** Demo mode only: one-tap sign-in to a seeded account. */
export async function signInDemo(phone: string, headers: Headers) {
  if (appMode() !== "demo") throw new AppError("demoOnly");
  await auth().api.signInEmail({ body: { email: authEmail(phone), password: demoPassword() }, headers });
}
