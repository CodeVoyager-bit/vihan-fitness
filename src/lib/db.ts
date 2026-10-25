import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import {
  type AggregateOptions,
  BSON,
  type AnyBulkWriteOperation,
  type BulkWriteOptions,
  type ClientSession,
  type Collection,
  type CountDocumentsOptions,
  type DeleteOptions,
  type Document,
  type Filter,
  type FindOneAndUpdateOptions,
  type FindOptions,
  type IndexDescription,
  type InsertOneOptions,
  MongoClient,
  type ObjectId,
  type OptionalUnlessRequiredId,
  type TransactionOptions,
  type UpdateFilter,
  type UpdateOptions,
} from "mongodb";

export type AppMode = "live" | "demo" | "test";

export function appMode(): AppMode {
  const m = process.env.APP_MODE ?? "live";
  if (m !== "live" && m !== "demo" && m !== "test") throw new Error(`Unknown APP_MODE "${m}"`);
  return m;
}

export const isDemo = () => appMode() === "demo";

/** Each mode has its own database, so demo or test data can never mix with live records. */
export const dbName = () => `vihan_${appMode()}`;

// ───────────────────────────── documents ─────────────────────────────
// Money is stored in paise (integers). Dates are 'YYYY-MM-DD' / months 'YYYY-MM' in Asia/Kolkata;
// timestamps are UTC ISO strings. Records that appear in URLs, forms or the audit log get a small
// numeric _id from `counters`; the rest use MongoDB's own ids.

type Lang = "en" | "mr" | "hi";
type Method = "cash" | "upi" | "other";

/** Better Auth owns name/email/createdAt and the password (in `accounts`); the rest is ours. */
export type UserDoc = {
  _id: ObjectId;
  uid: number; // the app's user id
  name: string;
  email: string; // hidden, derived from the phone (see accounts.ts)
  phone: string;
  role: "admin" | "member";
  status: "pending" | "approved" | "rejected";
  language: Lang;
  createdAt: Date;
  photo?: string | null; // Cloudinary URL
  billing_start_month?: string; // set on approval
  followup_opt_in?: number;
  admin_note?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
  rejected_reason?: string | null;
};
export type StatusDoc = { _id: number; member_id: number; status: "active" | "paused" | "left"; effective_month: string; reason: string | null; created_by: number | null; created_at: string };
export type FeeDoc = { _id: string /* effective month */; amount_paise: number; created_at: string };
export type ChargeDoc = {
  _id: number;
  member_id: number;
  kind: "monthly" | "opening" | "manual";
  period_month: string | null;
  amount_paise: number;
  due_date: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
};
type Reversal = { reversed_at: string | null; reversed_by: number | null; reversal_reason: string | null };
export type WaiverDoc = { _id: number; charge_id: number; member_id: number; amount_paise: number; reason: string; source: "admin" | "status"; created_by: number | null; created_at: string } & Reversal;
export type PaymentDoc = {
  _id: number;
  member_id: number;
  amount_paise: number;
  paid_on: string;
  method: Method;
  reference: string | null;
  note: string | null;
  idempotency_key: string | null;
  recorded_by: number;
  created_at: string;
} & Reversal;
export type AllocationDoc = { _id?: ObjectId; payment_id: number; charge_id: number; member_id: number; amount_paise: number; created_at: string };
export type ClaimDoc = {
  _id: number;
  member_id: number;
  amount_paise: number;
  paid_on: string;
  method: Method;
  reference: string | null;
  note: string | null;
  status: "pending" | "confirmed" | "rejected";
  payment_id: number | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  /** Screenshot the member attached to a UPI claim (Cloudinary URL); absent on older claims. */
  proof?: string | null;
};
export type AttendanceDoc = { _id?: ObjectId; member_id: number; visit_date: string; recorded_at: string; source: "qr" | "app" | "admin"; created_by: number | null };
export type GoalDoc = { _id?: ObjectId; member_id: number; month: string; target_visits: number };
export type OnboardingDoc = { _id?: ObjectId; member_id: number; item: string; done_at: string; done_by: number | null };
export type HelpDoc = {
  _id: number;
  member_id: number;
  topic: "routine" | "general";
  message: string | null;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  admin_note: string | null;
};
export type ChallengeDoc = {
  _id: number;
  month: string;
  template: "target" | "back_on_track" | "buddy";
  target_visits: number | null;
  offer_text: string | null;
  active: number;
  created_by: number | null;
  created_at: string;
};
export type EntryDoc = { _id?: ObjectId; challenge_id: number; member_id: number; joined_at: string; completed_at: string | null; show_name: number };
export type ReminderDoc = { _id: number; member_id: number; kind: "fee" | "attendance" | "receipt"; language: string; opened_by: number; opened_at: string };
export type AuditDoc = { _id: number; at: string; actor_id: number | null; action: string; member_id: number | null; entity: string | null; entity_id: number | null; detail: string | null };
export type ResetCodeDoc = { _id: number; user_id: number; code_hash: string; expires_at: string; used_at: string | null; attempts: number; created_by: number; created_at: string };
export type RateLimitDoc = { _id: string; count: number; window_start: number; expires_at: Date };

type Docs = {
  users: UserDoc;
  sessions: Document; // Better Auth
  accounts: Document; // Better Auth
  verifications: Document; // Better Auth
  counters: { _id: string; seq: number };
  locks: { _id: string; n: number };
  settings: { _id: string; value: string };
  fee_schedule: FeeDoc;
  membership_status: StatusDoc;
  charges: ChargeDoc;
  waivers: WaiverDoc;
  payments: PaymentDoc;
  allocations: AllocationDoc;
  claims: ClaimDoc;
  attendance: AttendanceDoc;
  goals: GoalDoc;
  onboarding: OnboardingDoc;
  help_requests: HelpDoc;
  challenges: ChallengeDoc;
  challenge_entries: EntryDoc;
  reminder_opens: ReminderDoc;
  audit: AuditDoc;
  reset_codes: ResetCodeDoc;
  rate_limits: RateLimitDoc;
};

// The rules SQLite used to enforce, as indexes. Partial filters use $type, not $exists: an explicit null
// would otherwise count as a value and collide.
const INDEXES: { [K in keyof Docs]: IndexDescription[] } = {
  // Better Auth's Mongo adapter creates none of its own: without these every page view scans all sessions.
  users: [{ key: { uid: 1 }, unique: true }, { key: { phone: 1 }, unique: true }, { key: { email: 1 }, unique: true }, { key: { role: 1, status: 1 } }],
  sessions: [{ key: { token: 1 }, unique: true }, { key: { userId: 1 } }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  accounts: [{ key: { userId: 1 } }],
  verifications: [{ key: { identifier: 1 } }],
  counters: [],
  locks: [],
  settings: [],
  fee_schedule: [],
  membership_status: [{ key: { member_id: 1, effective_month: -1 } }],
  // The guard against duplicate monthly billing lives in the database, not in app code.
  charges: [{ key: { member_id: 1, period_month: 1 }, unique: true, partialFilterExpression: { kind: "monthly" } }, { key: { member_id: 1 } }],
  waivers: [{ key: { member_id: 1 } }, { key: { charge_id: 1 } }],
  payments: [{ key: { idempotency_key: 1 }, unique: true, partialFilterExpression: { idempotency_key: { $type: "string" } } }, { key: { member_id: 1 } }],
  allocations: [{ key: { payment_id: 1, charge_id: 1 }, unique: true }, { key: { member_id: 1 } }, { key: { charge_id: 1 } }],
  claims: [{ key: { payment_id: 1 }, unique: true, partialFilterExpression: { payment_id: { $type: "number" } } }, { key: { member_id: 1, status: 1 } }],
  attendance: [{ key: { member_id: 1, visit_date: 1 }, unique: true }, { key: { visit_date: 1 } }],
  goals: [{ key: { member_id: 1, month: 1 }, unique: true }],
  onboarding: [{ key: { member_id: 1, item: 1 }, unique: true }],
  help_requests: [{ key: { member_id: 1 } }, { key: { status: 1 } }],
  challenges: [{ key: { month: 1 } }],
  challenge_entries: [{ key: { challenge_id: 1, member_id: 1 }, unique: true }],
  reminder_opens: [{ key: { member_id: 1, kind: 1 } }],
  audit: [{ key: { member_id: 1, _id: -1 } }],
  reset_codes: [{ key: { user_id: 1 } }],
  rate_limits: [{ key: { expires_at: 1 }, expireAfterSeconds: 0 }],
};

const DEFAULT_SETTINGS: Record<string, string> = {
  due_day: "10",
  inactivity_days: "8",
  followup_cooldown_days: "7",
};

// ───────────────────────────── connection ─────────────────────────────

// Inside tx(), every query runs on that transaction's session, wherever it is called from.
const current = new AsyncLocalStorage<ClientSession>();
const s = <O extends object>(o?: O) => ({ ...o, session: current.getStore() }) as O & { session?: ClientSession };

/** A collection whose operations join the current transaction automatically. `raw` bypasses it. */
function scoped<T extends Document>(c: Collection<T>) {
  return {
    raw: c,
    find: (f: Filter<T> = {}, o?: FindOptions) => c.find(f, s(o)),
    findOne: (f: Filter<T>, o?: FindOptions) => c.findOne(f, s(o)),
    count: (f: Filter<T> = {}, o?: CountDocumentsOptions) => c.countDocuments(f, s(o)),
    insertOne: (doc: OptionalUnlessRequiredId<T>, o?: InsertOneOptions) => c.insertOne(doc, s(o)),
    insertMany: async (docs: OptionalUnlessRequiredId<T>[], o?: BulkWriteOptions) => (docs.length ? c.insertMany(docs, s(o)) : null),
    updateOne: (f: Filter<T>, u: UpdateFilter<T> | Document[], o?: UpdateOptions) => c.updateOne(f, u, s(o)),
    updateMany: (f: Filter<T>, u: UpdateFilter<T>, o?: UpdateOptions) => c.updateMany(f, u, s(o)),
    deleteOne: (f: Filter<T>, o?: DeleteOptions) => c.deleteOne(f, s(o)),
    deleteMany: (f: Filter<T>, o?: DeleteOptions) => c.deleteMany(f, s(o)),
    findOneAndUpdate: (f: Filter<T>, u: UpdateFilter<T> | Document[], o: FindOneAndUpdateOptions = {}) => c.findOneAndUpdate(f, u, s(o)),
    aggregate: <R extends Document>(pipeline: Document[], o?: AggregateOptions) => c.aggregate<R>(pipeline, s(o)),
    bulkWrite: async (ops: AnyBulkWriteOperation<T>[], o?: BulkWriteOptions) => (ops.length ? c.bulkWrite(ops, s(o)) : null),
  };
}

export type DB = { [K in keyof Docs]: ReturnType<typeof scoped<Docs[K]>> };

const g = globalThis as unknown as { __vfClient?: MongoClient; __vfDb?: Promise<DB> };

/** One client per server instance (serverless functions reuse it between requests). */
export function mongo(): MongoClient {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example).");
  return (g.__vfClient ??= new MongoClient(uri, { maxPoolSize: 10, maxIdleTimeMS: 60_000 }));
}

/** The collections, ready to use: indexes and defaults are set up once per server instance. */
export function db(): Promise<DB> {
  return (g.__vfDb ??= init().catch((e: unknown) => {
    g.__vfDb = undefined; // retry on the next request instead of caching the failure
    throw e;
  }));
}

async function init(): Promise<DB> {
  const raw = mongo().db(dbName());
  const d = Object.fromEntries(Object.keys(INDEXES).map((name) => [name, scoped(raw.collection(name))])) as DB;
  // createIndexes is a no-op for indexes that already exist. One that can't be built (say old data breaks a
  // new unique rule) is logged and retried on the next start instead of taking every page down; indexes
  // already in place keep enforcing their rules either way.
  const specs = Object.entries(INDEXES).filter(([, list]) => list.length);
  const built = await Promise.allSettled(specs.map(([name, list]) => raw.collection(name).createIndexes(list)));
  built.forEach((r, i) => r.status === "rejected" && console.error(`Indexes on ${specs[i][0]} not built:`, r.reason));
  await seedDefaults(d);
  return d;
}

async function seedDefaults(d: DB) {
  // The door QR works from day one.
  const defaults = { ...DEFAULT_SETTINGS, checkin_key: crypto.randomBytes(9).toString("base64url") };
  await d.settings.raw.bulkWrite(Object.entries(defaults).map(([k, v]) => ({ updateOne: { filter: { _id: k }, update: { $setOnInsert: { value: v } }, upsert: true } })));
  await d.locks.raw.updateOne({ _id: "ledger" }, { $setOnInsert: { n: 0 } }, { upsert: true });
}

/** Scripts call this before exiting so the process doesn't wait on open sockets. */
export async function closeDb() {
  await g.__vfClient?.close();
  g.__vfClient = g.__vfDb = undefined;
}

/** Test helper: empty every collection (indexes stay) and restore the defaults. */
export async function resetDbForTests() {
  const d = await db();
  await Promise.all(Object.values(d).map((c) => c.raw.deleteMany({})));
  await seedDefaults(d);
}

// ───────────────────────────── transactions ─────────────────────────────

const TX: TransactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" };

/**
 * Runs `fn` in one transaction: all or nothing. Every transaction first bumps one shared lock document,
 * so concurrent writers queue up one at a time (the driver retries the loser) — reads inside a transaction
 * see a world nobody else is changing, as with SQLite's BEGIN IMMEDIATE. Nested calls join the outer one.
 * The driver may run `fn` again after a conflict, so it must only touch the database.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (current.getStore()) return fn();
  const d = await db();
  const session = mongo().startSession();
  try {
    return await session.withTransaction(
      () =>
        current.run(session, async () => {
          await d.locks.updateOne({ _id: "ledger" }, { $inc: { n: 1 } });
          return fn();
        }),
      TX,
    );
  } finally {
    await session.endSession();
  }
}

/**
 * Independent reads: in parallel normally, one after another inside a transaction (a session can't run
 * two operations at once).
 */
export async function all<T extends readonly (() => Promise<unknown>)[]>(...fns: T): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  type Out = { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
  if (!current.getStore()) return (await Promise.all(fns.map((f) => f()))) as Out;
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as Out;
}

/**
 * Reserves `n` consecutive ids for a collection and returns the first. Runs outside any transaction, so a
 * retried transaction just leaves a gap.
 */
export async function nextId(name: string, n = 1): Promise<number> {
  const d = await db();
  const r = await d.counters.raw.findOneAndUpdate({ _id: name }, { $inc: { seq: n } }, { upsert: true, returnDocument: "after" });
  return r!.seq - n + 1;
}

// ───────────────────────────── helpers ─────────────────────────────

export const nowIso = () => new Date().toISOString();

/** A month's dates as a range query ('YYYY-MM-01' … 'YYYY-MM-31'), which can use an index. */
export const inMonth = (month: string) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

export async function setting(key: string): Promise<string | undefined> {
  return (await (await db()).settings.findOne({ _id: key }))?.value;
}

export async function settingInt(key: string, fallback: number): Promise<number> {
  const v = await setting(key);
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined ? n : fallback;
}

export async function setSetting(key: string, value: string) {
  await (await db()).settings.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
}

/** Every setting whose key starts with one of `prefixes`, in one query. */
export async function settingsByPrefix(prefixes: string[]): Promise<Map<string, string>> {
  const re = new RegExp(`^(${prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
  const rows = await (await db()).settings.find({ _id: { $regex: re } }).toArray();
  return new Map(rows.map((r) => [r._id, r.value]));
}

/** Writes many settings at once; `null` deletes the key (back to its built-in default). */
export async function setSettings(values: Record<string, string | null>) {
  await (await db()).settings.bulkWrite(
    Object.entries(values).map(([k, v]) => (v === null ? { deleteOne: { filter: { _id: k } } } : { updateOne: { filter: { _id: k }, update: { $set: { value: v } }, upsert: true } })),
  );
}

export async function audit(actorId: number | null, action: string, o: { memberId?: number | null; entity?: string; entityId?: number; detail?: unknown } = {}) {
  const d = await db();
  await d.audit.insertOne({
    _id: await nextId("audit"),
    at: nowIso(),
    actor_id: actorId,
    action,
    member_id: o.memberId ?? null,
    entity: o.entity ?? null,
    entity_id: o.entityId ?? null,
    detail: o.detail === undefined ? null : JSON.stringify(o.detail),
  });
}

/** An expected, user-facing failure. `code` is an i18n key under `errors`. */
export class AppError extends Error {
  constructor(
    public code: string,
    public field?: string,
  ) {
    super(code);
  }
}

// ───────────────────────────── backups ─────────────────────────────

/** Sign-in sessions, codes and counters of attempts are short-lived; a restore doesn't need them. */
const NOT_BACKED_UP = new Set(["sessions", "verifications", "rate_limits", "reset_codes", "locks"]);

/**
 * The whole database as lines of Extended JSON (`{"c": collection, "d": document}`), streamed so a large
 * backup never sits in memory. `npm run restore -- <file>` loads it into an empty database.
 */
export async function* backupLines(): AsyncGenerator<string> {
  const d = await db();
  // One snapshot for every collection, so a payment saved mid-backup is in it whole (payment, allocations,
  // counter) or not at all. The server keeps snapshots ~5 minutes; a slower backup fails instead of drifting.
  const session = mongo().startSession({ snapshot: true });
  try {
    for (const [name, c] of Object.entries(d)) {
      if (NOT_BACKED_UP.has(name)) continue;
      for await (const doc of c.raw.find({}, { session })) yield BSON.EJSON.stringify({ c: name, d: doc }, { relaxed: false }) + "\n";
    }
  } finally {
    await session.endSession();
  }
}
