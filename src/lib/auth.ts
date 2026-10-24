import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { ObjectId } from "mongodb";
import { db, dbName, mongo, nextId } from "./db";

// Better Auth handles passwords and sessions. It is only called from our own server code (accounts.ts);
// no /api/auth route is mounted, so our per-phone and per-IP limits stay the only way to sign in.
// Nothing here imports next/*: scripts and tests load it too (nextCookies does nothing outside Next).

export const PASSWORD_MIN = 8;

function createAuth() {
  const client = mongo();
  return betterAuth({
    appName: "Vihan Fitness",
    // Cookies are Secure whenever this address is https (Vercel sets VERCEL_URL on every deployment).
    baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
    secret: process.env.BETTER_AUTH_SECRET, // required in production
    database: mongodbAdapter(client.db(dbName()), { client }),
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN, maxPasswordLength: 128, autoSignIn: true },
    // Sessions last 30 days from sign-in, as before. No sliding refresh: pages can't rewrite cookies.
    session: { modelName: "sessions", expiresIn: 30 * 86_400, disableSessionRefresh: true },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    user: {
      modelName: "users",
      additionalFields: {
        uid: { type: "number", input: false },
        phone: { type: "string", required: true },
        role: { type: "string", input: false, defaultValue: "member" },
        status: { type: "string", input: false, defaultValue: "pending" },
        language: { type: "string", defaultValue: "en" },
      },
    },
    databaseHooks: {
      // The app refers to people by a small number (URLs, ledgers, audit), not by Better Auth's id.
      user: { create: { before: async (user) => ({ data: { ...user, uid: await nextId("users") } }) } },
      session: {
        create: {
          // Runs only after the password was right, so it doesn't reveal which numbers are registered.
          before: async (session) => {
            const u = await (await db()).users.findOne({ _id: new ObjectId(session.userId) }, { projection: { status: 1 } });
            if (u?.status === "rejected") throw new APIError("FORBIDDEN", { code: "ACCOUNT_REJECTED", message: "Registration was not approved" });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

const g = globalThis as unknown as { __vfAuth?: ReturnType<typeof createAuth> };

/** Created on first use, so building the app doesn't need database settings. */
export const auth = () => (g.__vfAuth ??= createAuth());
