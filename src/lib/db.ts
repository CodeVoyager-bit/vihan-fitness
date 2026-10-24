import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type AppMode = "live" | "demo" | "test";

export function appMode(): AppMode {
  const m = process.env.APP_MODE ?? "live";
  if (m !== "live" && m !== "demo" && m !== "test") throw new Error(`Unknown APP_MODE "${m}"`);
  return m;
}

export const isDemo = () => appMode() === "demo";

// Default lives outside the project folder: the dev server's file watcher opening files inside the
// project drops SQLite's POSIX locks and can corrupt the WAL when a script writes at the same time.
export function dbPath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  return path.join(os.homedir(), ".vihan-fitness", appMode() === "demo" ? "demo.db" : "vihan.db");
}

// Money is stored in paise (integers). Dates are 'YYYY-MM-DD' / months 'YYYY-MM' in Asia/Kolkata;
// timestamps are UTC ISO strings.
const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','mr','hi')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  rejected_reason TEXT
);

CREATE TABLE IF NOT EXISTS members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  billing_start_month TEXT NOT NULL,
  followup_opt_in INTEGER NOT NULL DEFAULT 1,
  admin_note TEXT
);

CREATE TABLE IF NOT EXISTS membership_status (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  status TEXT NOT NULL CHECK (status IN ('active','paused','left')),
  effective_month TEXT NOT NULL,
  reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS membership_status_member ON membership_status(member_id, effective_month);

CREATE TABLE IF NOT EXISTS fee_schedule (
  effective_month TEXT PRIMARY KEY,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  kind TEXT NOT NULL CHECK (kind IN ('monthly','opening','manual')),
  period_month TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  due_date TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (kind <> 'monthly' OR period_month IS NOT NULL)
);
-- The guard against duplicate monthly billing lives in the database, not in app code.
CREATE UNIQUE INDEX IF NOT EXISTS charges_one_monthly ON charges(member_id, period_month) WHERE kind = 'monthly';

CREATE TABLE IF NOT EXISTS waivers (
  id INTEGER PRIMARY KEY,
  charge_id INTEGER NOT NULL REFERENCES charges(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin','status')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  reversed_by INTEGER REFERENCES users(id),
  reversal_reason TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','upi','other')),
  reference TEXT,
  note TEXT,
  idempotency_key TEXT UNIQUE,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  reversed_by INTEGER REFERENCES users(id),
  reversal_reason TEXT
);
CREATE INDEX IF NOT EXISTS payments_member ON payments(member_id);

CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  charge_id INTEGER NOT NULL REFERENCES charges(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  created_at TEXT NOT NULL,
  UNIQUE (payment_id, charge_id)
);
CREATE INDEX IF NOT EXISTS allocations_charge ON allocations(charge_id);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','upi','other')),
  reference TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  payment_id INTEGER UNIQUE REFERENCES payments(id),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  CHECK (status <> 'confirmed' OR payment_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  visit_date TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('qr','app','admin')),
  created_by INTEGER REFERENCES users(id),
  UNIQUE (member_id, visit_date)
);

CREATE TABLE IF NOT EXISTS goals (
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  month TEXT NOT NULL,
  target_visits INTEGER NOT NULL CHECK (target_visits BETWEEN 1 AND 31),
  PRIMARY KEY (member_id, month)
);

CREATE TABLE IF NOT EXISTS onboarding (
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  item TEXT NOT NULL,
  done_at TEXT NOT NULL,
  done_by INTEGER REFERENCES users(id),
  PRIMARY KEY (member_id, item)
);

CREATE TABLE IF NOT EXISTS help_requests (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  topic TEXT NOT NULL CHECK (topic IN ('routine','general')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  admin_note TEXT
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('target','back_on_track','buddy')),
  target_visits INTEGER,
  offer_text TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenge_entries (
  challenge_id INTEGER NOT NULL REFERENCES challenges(id),
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  joined_at TEXT NOT NULL,
  completed_at TEXT,
  show_name INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (challenge_id, member_id)
);

CREATE TABLE IF NOT EXISTS reminder_opens (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(user_id),
  kind TEXT NOT NULL CHECK (kind IN ('fee','attendance','receipt')),
  language TEXT NOT NULL,
  opened_by INTEGER NOT NULL REFERENCES users(id),
  opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  member_id INTEGER,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_member ON audit(member_id, id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- Derived balances. A reversed payment's allocations stop counting; nothing is deleted.
CREATE VIEW IF NOT EXISTS charge_balances AS
SELECT c.*,
  COALESCE((SELECT SUM(a.amount_paise) FROM allocations a JOIN payments p ON p.id = a.payment_id
            WHERE a.charge_id = c.id AND p.reversed_at IS NULL), 0) AS paid_paise,
  COALESCE((SELECT SUM(w.amount_paise) FROM waivers w
            WHERE w.charge_id = c.id AND w.reversed_at IS NULL), 0) AS waived_paise
FROM charges c;

CREATE VIEW IF NOT EXISTS payment_balances AS
SELECT p.*,
  p.amount_paise - COALESCE((SELECT SUM(a.amount_paise) FROM allocations a WHERE a.payment_id = p.id), 0) AS unallocated_paise
FROM payments p;
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  due_day: "10",
  inactivity_days: "8",
  followup_cooldown_days: "7",
};

function open(): Database.Database {
  const file = dbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);

  // Refuse to run live code against demo data (or the reverse).
  const mode = appMode();
  const stored = db.prepare("SELECT value FROM meta WHERE key = 'mode'").get() as { value: string } | undefined;
  if (!stored) db.prepare("INSERT INTO meta (key, value) VALUES ('mode', ?)").run(mode);
  else if (stored.value !== mode)
    throw new Error(`Database ${file} holds ${stored.value} data but APP_MODE is ${mode}. Refusing to start.`);

  const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return db;
}

const g = globalThis as unknown as { __vfDb?: Database.Database };

export function db(): Database.Database {
  return (g.__vfDb ??= open());
}

/** Test helper: drop the cached connection so the next db() opens a fresh one. */
export function resetDbForTests() {
  g.__vfDb?.close();
  g.__vfDb = undefined;
}

export const nowIso = () => new Date().toISOString();

export function tx<T>(fn: () => T): T {
  return db().transaction(fn).immediate();
}

export function setting(key: string): string | undefined {
  return (db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}

export function settingInt(key: string, fallback: number): number {
  const n = Number(setting(key));
  return Number.isFinite(n) && setting(key) !== undefined ? n : fallback;
}

export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function audit(
  actorId: number | null,
  action: string,
  o: { memberId?: number | null; entity?: string; entityId?: number | bigint; detail?: unknown } = {},
) {
  db()
    .prepare("INSERT INTO audit (at, actor_id, action, member_id, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(nowIso(), actorId, action, o.memberId ?? null, o.entity ?? null, o.entityId ?? null, o.detail === undefined ? null : JSON.stringify(o.detail));
}

/** An expected, user-facing failure. `code` is an i18n key under `errors`. */
export class AppError extends Error {
  constructor(public code: string, public field?: string) {
    super(code);
  }
}
