// End-to-end access checks against a running DEMO server (server-side enforcement, not hidden UI).
// Run: npm run dev:demo   (in another terminal), then: npm run test:access
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
process.env.APP_MODE = "demo";

const { db } = await import("../src/lib/db");
const { createSession } = await import("../src/lib/accounts");

const id = (phone: string) => (db().prepare("SELECT id FROM users WHERE phone = ?").get(phone) as { id: number }).id;
const cookie: Record<string, string> = {};

async function get(url: string, who?: string) {
  return fetch(BASE + url, { redirect: "manual", headers: who ? { cookie: `vf_session=${cookie[who]}` } : {} });
}
const location = (r: Response) => new URL(r.headers.get("location") ?? "/", BASE).pathname;

before(() => {
  cookie.admin = createSession(id("+919000000001")).token;
  cookie.member = createSession(id("+919000000010")).token; // Krish
  cookie.pending = createSession(id("+919000000090")).token; // Rohan, not approved
});

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
    const others = db()
      .prepare("SELECT name, phone FROM users WHERE role = 'member' AND phone <> '+919000000010'")
      .all() as { name: string; phone: string }[];
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
