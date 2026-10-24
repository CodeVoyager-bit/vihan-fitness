// End-to-end access checks against a running DEMO server (server-side enforcement, not hidden UI).
// Run: npm run dev:demo   (in another terminal), then: npm run test:access
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
process.env.APP_MODE = "demo";
process.env.BETTER_AUTH_URL = BASE; // same address → same cookie names as the server (https ones are Secure)

const { closeDb, db } = await import("../src/lib/db");
const { authEmail, demoPassword } = await import("../src/lib/accounts");
const { auth } = await import("../src/lib/auth");

const cookie: Record<string, string> = {};
/** Signs a seeded demo account in, the way the login form does, and keeps its session cookie. */
async function signIn(phone: string) {
  const { headers } = await auth().api.signInEmail({ body: { email: authEmail(phone), password: demoPassword() }, returnHeaders: true });
  return headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function get(url: string, who?: string) {
  return fetch(BASE + url, { redirect: "manual", headers: who ? { cookie: cookie[who] } : {} });
}
const location = (r: Response) => new URL(r.headers.get("location") ?? "/", BASE).pathname;

before(async () => {
  cookie.admin = await signIn("+919000000001");
  cookie.member = await signIn("+919000000010"); // Krish
  cookie.pending = await signIn("+919000000090"); // Rohan, not approved
});
after(closeDb);

describe("anonymous visitors", () => {
  for (const url of ["/admin", "/admin/members/2", "/app", "/app/fees", "/admin/export/payments", "/admin/export/backup"])
    test(`${url} → login`, async () => {
      const r = await get(url);
      assert.ok([303, 307, 308].includes(r.status), `status ${r.status}`);
      assert.equal(location(r), "/login");
    });

  test("public page and login are open", async () => {
    assert.equal((await get("/")).status, 200);
    assert.equal((await get("/login")).status, 200);
  });
});

describe("pending registrations", () => {
  for (const url of ["/app", "/app/fees", "/app/attendance", "/admin", "/admin/export/members"])
    test(`${url} → /pending`, async () => {
      const r = await get(url, "pending");
      assert.equal(location(r), "/pending");
    });
});

describe("members", () => {
  for (const url of ["/admin", "/admin/members", "/admin/members/3", "/admin/pay?m=3", "/admin/claims", "/admin/export/payments", "/admin/export/backup"])
    test(`${url} is refused`, async () => {
      const r = await get(url, "member");
      assert.ok([303, 307, 308].includes(r.status), `status ${r.status} for ${url}`);
      assert.equal(location(r), "/app");
    });

  test("member pages show only their own records", async () => {
    const others = await (await db()).users.find({ role: "member", phone: { $ne: "+919000000010" } }, { projection: { name: 1, phone: 1 } }).toArray();
    for (const url of ["/app", "/app/fees", "/app/attendance", "/app/profile", "/app/help"]) {
      const r = await get(url, "member");
      assert.equal(r.status, 200, `${url} should render for Krish`);
      const html = await r.text();
      for (const o of others) {
        assert.ok(!html.includes(o.phone.slice(3)), `${url} leaks ${o.name}'s phone`);
        assert.ok(!html.includes(o.name), `${url} leaks ${o.name}'s name`);
      }
    }
  });
});

describe("admin", () => {
  test("exports are available to the admin only", async () => {
    const r = await get("/admin/export/payments", "admin");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(await r.text(), /amount/);
  });
});
