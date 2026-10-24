import crypto from "node:crypto";
import { promisify } from "node:util";
import { AppError, audit, db, nowIso } from "./db";
import { normalizePhone } from "./phone";

// Passwords: Node's built-in scrypt (memory-hard KDF), per-user random salt, constant-time compare.
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const KDF = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, KDF);
  return `scrypt$${KDF.N}$${KDF.r}$${KDF.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p, maxmem: KDF.maxmem });
  return crypto.timingSafeEqual(actual, expected);
}

export const PASSWORD_MIN = 8;
export function checkPassword(pw: string) {
  if (pw.length < PASSWORD_MIN || pw.length > 128) throw new AppError("passwordTooShort", "password");
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// ───────────────────────────── rate limiting ─────────────────────────────

/** Fixed-window counter in SQLite. Returns false once `limit` hits within `windowSec`. */
export function rateLimit(key: string, limit: number, windowSec: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const row = db().prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as { count: number; window_start: number } | undefined;
  if (!row || now - row.window_start >= windowSec) {
    db().prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start").run(key, now);
    return true;
  }
  if (row.count >= limit) return false;
  db().prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
  return true;
}

export const clearRateLimit = (key: string) => db().prepare("DELETE FROM rate_limits WHERE key = ?").run(key);

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

export async function registerMember(input: { name: string; phone: string; password: string; language: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new AppError("nameInvalid", "name");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AppError("phoneInvalid", "phone");
  checkPassword(input.password);
  const language = LANGS.includes(input.language as Lang) ? input.language : "en";
  if (db().prepare("SELECT 1 FROM users WHERE phone = ?").get(phone)) {
    audit(null, "registration.duplicate", { detail: { phone: phone.slice(0, 5) + "•••••" + phone.slice(-2) } });
    throw new AppError("phoneTaken", "phone");
  }
  const hash = await hashPassword(input.password);
  try {
    const r = db()
      .prepare("INSERT INTO users (phone, name, password_hash, role, status, language, created_at) VALUES (?, ?, ?, 'member', 'pending', ?, ?)")
      .run(phone, name, hash, language, nowIso());
    audit(Number(r.lastInsertRowid), "registration.submitted", { entity: "user", entityId: r.lastInsertRowid });
    return Number(r.lastInsertRowid);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new AppError("phoneTaken", "phone"); // lost a race with a twin submit
    throw e;
  }
}

/** Returns the user id on success. Same error for unknown phone and wrong password. */
export async function authenticate(phoneInput: string, password: string, ip: string): Promise<number> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new AppError("phoneInvalid", "phone");
  if (!rateLimit(`login:ip:${ip}`, 30, 15 * 60) || !rateLimit(`login:phone:${phone}`, 6, 15 * 60)) throw new AppError("tooManyAttempts");
  const u = db().prepare("SELECT id, password_hash, status FROM users WHERE phone = ?").get(phone) as
    | { id: number; password_hash: string; status: string }
    | undefined;
  // Hash anyway for unknown users so timing doesn't reveal which numbers are registered.
  const ok = u ? await verifyPassword(password, u.password_hash) : (await hashPassword(password), false);
  if (!u || !ok) throw new AppError("badCredentials");
  if (u.status === "rejected") throw new AppError("accountRejected");
  clearRateLimit(`login:phone:${phone}`);
  return u.id;
}

export async function changePassword(userId: number, current: string, next: string) {
  const u = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string };
  if (!(await verifyPassword(current, u.password_hash))) throw new AppError("badCurrentPassword", "current");
  checkPassword(next);
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(next), userId);
  audit(userId, "password.changed", { entity: "user", entityId: userId });
}

// ───────────────────────────── sessions ─────────────────────────────

export const SESSION_DAYS = 30;

/** Opaque random token in the cookie; only its SHA-256 is stored, so a DB leak can't be replayed. */
export function createSession(userId: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db().prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha256(token), userId, nowIso(), expires.toISOString());
  return { token, expires };
}

export function userForToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const u = db()
    .prepare(
      `SELECT u.id, u.name, u.phone, u.role, u.status, u.language FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), nowIso()) as SessionUser | undefined;
  return u ?? null;
}

export const destroySession = (token: string) => db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
export const destroyAllSessions = (userId: number) => db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

// ───────────────────────────── password reset (no OTP) ─────────────────────────────
// Bharat checks identity in person, then issues a short-lived, single-use code.

const RESET_MINUTES = 30;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L confusion

export function issueResetCode(userId: number, actorId: number): { code: string; expires: Date } {
  let code = "";
  for (const b of crypto.randomBytes(8)) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  const expires = new Date(Date.now() + RESET_MINUTES * 60_000);
  db().prepare("UPDATE reset_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(nowIso(), userId); // one live code at a time
  db().prepare("INSERT INTO reset_codes (user_id, code_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?)").run(userId, sha256(code), expires.toISOString(), actorId, nowIso());
  audit(actorId, "password.reset_issued", { memberId: userId, entity: "user", entityId: userId });
  return { code, expires };
}

export async function redeemResetCode(phoneInput: string, code: string, newPassword: string, ip: string) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new AppError("phoneInvalid", "phone");
  if (!rateLimit(`reset:ip:${ip}`, 20, 15 * 60)) throw new AppError("tooManyAttempts");
  checkPassword(newPassword);
  const row = db()
    .prepare(
      `SELECT r.id, r.code_hash, r.attempts, u.id AS user_id FROM reset_codes r JOIN users u ON u.id = r.user_id
       WHERE u.phone = ? AND r.used_at IS NULL AND r.expires_at > ? ORDER BY r.id DESC LIMIT 1`,
    )
    .get(phone, nowIso()) as { id: number; code_hash: string; attempts: number; user_id: number } | undefined;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!row || row.attempts >= 5) throw new AppError("resetCodeInvalid", "code");
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(normalized)));
  if (!ok) {
    db().prepare("UPDATE reset_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    throw new AppError("resetCodeInvalid", "code");
  }
  const hash = await hashPassword(newPassword);
  db().transaction(() => {
    db().prepare("UPDATE reset_codes SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
    db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id);
    destroyAllSessions(row.user_id);
  })();
  audit(row.user_id, "password.reset_used", { memberId: row.user_id, entity: "user", entityId: row.user_id });
  return row.user_id;
}

export function setLanguage(userId: number, lang: string) {
  if (!LANGS.includes(lang as Lang)) throw new AppError("invalidInput");
  db().prepare("UPDATE users SET language = ? WHERE id = ?").run(lang, userId);
}
