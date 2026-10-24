# Vihan Fitness

Membership, fees and member engagement for **Vihan Fitness, Nagothane** (owner & trainer: Bharat Gite).
A mobile-first web app with three parts:

- **Admin** (`/admin`) — Bharat's pocket assistant: who owes what, record payments, confirm "I have paid" claims, approve registrations, WhatsApp reminders, follow-ups, exports.
- **Member app** (`/app`) — personal visit goal, QR check-in, fees and payment history, "I have paid", help requests.
- **Public page** (`/`) — animated landing page whose facts (timings, address, phone, trainer text…) Bharat edits in **More → Public page**. Unconfirmed facts show as clearly marked placeholders.

English, मराठी and हिन्दी throughout. Money changes hands outside the app (cash/UPI); the app only keeps the record.

See [docs/SCREEN_MAP.md](docs/SCREEN_MAP.md) for the screen map and business assumptions, [docs/BHARAT_GUIDE.md](docs/BHARAT_GUIDE.md) for Bharat's guide, and [docs/PILOT_STATUS.md](docs/PILOT_STATUS.md) for what works and what's left.

---

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js 16 (App Router, server actions), React 19, TypeScript | One deployable unit, server-side rendering on slow phones |
| Data | MongoDB Atlas (official `mongodb` driver), transactions for every money change | Hosted, works on Vercel (no disk needed), free tier covers the pilot |
| Auth | Better Auth (scrypt hashes, database sessions in an httpOnly cookie) behind phone + password, per-phone/IP rate limits, in-person reset codes | No OTP/SMS cost; Better Auth can add OTP or other sign-in methods later |
| Hosting | Vercel (`vercel.json` pins Mumbai, `bom1`) | Git push to deploy; put the Atlas cluster in Mumbai too |
| UI | Tailwind CSS v4 design tokens, Lucide icons, Barlow / Barlow Condensed + Mukta / Anek Devanagari | Condensed athletic type with proper Devanagari |
| Motion | React Bits components (`src/components/bits`, vendored from reactbits.dev), `motion`, `gsap`, WebGL light rays | All respect `prefers-reduced-motion`; WebGL is client-only and pauses off-screen |

No paid services, no payment gateway, no messaging API. WhatsApp opens with a prefilled message and Bharat presses Send.

## Run it locally (demo data)

Requirements: Node.js 20+, npm, and a MongoDB connection string in `.env.local` (`MONGODB_URI`; your Atlas cluster is fine — demo data goes to its own `vihan_demo` database). See `.env.example`.

```bash
npm install
```

```bash
npm run demo:seed
```

```bash
npm run dev:demo
```

Open http://localhost:3000. The login page shows one-tap **demo accounts** (admin, member, pending registration) — these buttons exist only in demo mode. The same accounts sign in with the password `vihan-demo` (set `DEMO_PASSWORD` to choose another).

The demo database (`vihan_demo`) is rebuilt from scratch each time you run `demo:seed` (stop the dev server first, then start it again). It covers: fully paid, unpaid, partial, multiple unpaid months, advance payment, claim awaiting confirmation, claim linked to an existing payment, paused member with older dues, member who left, duplicate registration attempt, reversed payment, goal completed, and an open help request.

### Tests

```bash
npm test
```

61 business-rule tests on a throwaway MongoDB (it uses your local `mongod` if installed, otherwise downloads one the first time): no duplicate monthly charges, partial / multi-month / advance payments, admin split overrides, idempotent payment saves, reversals and waivers, claims that can't clear a balance before confirmation or be confirmed twice, claim linking without double counting, pause/leave/resume, one visit per Asia/Kolkata day, goals, follow-up exclusions, phone normalisation, password hashing, login rate limits, reset codes, Better Auth sessions (forged cookies, sign-out, rejected accounts), and requests that really run at the same time (double-tapped saves, a payment racing a waiver, two claims linking one payment, a pause racing the billing run).

```bash
npm run test:access
```

21 HTTP checks against a **running demo server** (`npm run dev:demo` in another terminal; set `BASE_URL` if it isn't on port 3000): anonymous visitors, pending registrations and members are refused admin pages and exports on the server, and member pages contain no other member's name or phone.

## Demo vs live

`APP_MODE` decides which database is used (`vihan_demo` or `vihan_live` on the same cluster), so demo records can never mix with real ones. `demo:seed` refuses to wipe anything but `vihan_demo`. Demo mode shows a banner on every page, hides real phone numbers from WhatsApp/call links and enables the one-tap demo logins; none of that exists in live mode.

## Deploy (live, on Vercel)

1. **Atlas cluster** — create it in **AWS Mumbai (ap-south-1)**, next to the Vercel functions (`bom1`); otherwise every page waits on a round trip to another continent. The free tier (M0) is enough for the pilot and supports the transactions the app relies on.
   - *Database Access*: a user with **readWrite** on `vihan_live` (and `vihan_demo` if you use demo previews) — not an Atlas admin.
   - *Network Access*: allow `0.0.0.0/0`. Vercel functions don't have fixed addresses; the strong database password is what protects it.
   - *Connect → Drivers → Node.js*: copy the `mongodb+srv://…` string and put the password in place of `<db_password>` (URL-encode symbols such as `@ : / #`). You don't need to choose a database name.
2. **Vercel project** — import the GitHub repo. In *Settings → Environment Variables* (Production):
   `APP_MODE=live`, `MONGODB_URI=…`, `BETTER_AUTH_SECRET=` (run `openssl rand -base64 32`), `BETTER_AUTH_URL=https://your-domain`, `APP_URL=https://your-domain`, and optionally `CLOUDINARY_URL`.
   For *Preview* deployments set `APP_MODE=demo`, so previews never touch live data.
3. **Deploy** — push to `main` (or `vercel --prod`). Indexes and default settings are created on the first request.
4. **Create Bharat's admin account** (there is no public admin sign-up) from your computer, with `.env.local` holding the production `MONGODB_URI` and `APP_MODE=live`:
   ```bash
   npm run admin:create -- --phone 98XXXXXXXX --name "Bharat Gite"
   ```
   It asks for the password (or reads `ADMIN_PASSWORD`). Run it again to reset the admin password.
5. **First login → More**
   - *Billing*: choose the **launch month** (nothing is charged before it) and the due day (default 10th). The fee schedule starts at ₹500 from the launch month.
   - *Public page*: fill in only confirmed details.
   - *QR codes*: print the check-in poster for the entrance and the registration poster.
6. **Backups** — Atlas's free tier keeps **no backups**. Download one regularly: Bharat from **More → Export records → Full backup**, or you with `npm run backup` (writes `backups/vihan-live-<time>.jsonl`, keeps 60). Keep copies off your laptop too (e.g. Google Drive). `npm run restore -- <file>` loads a backup into an empty database.

Monthly charges appear on the first visit of each day; no cron job is needed (`npm run billing:run` does the same by hand).

### Updating

Push to `main`; Vercel builds and deploys. New indexes are created automatically on the next request.

## Security notes

- Every page, server action and export calls a server-side guard (`requireAdmin` / `requireMember` in `src/lib/session.ts`). Member actions never accept a member id from the browser — it always comes from the session.
- Passwords and sessions are Better Auth's: scrypt hashes with per-user salt, random session tokens in a signed httpOnly cookie. Better Auth is only called from the app's own server actions (no `/api/auth` route), so the per-phone/IP limits can't be bypassed. A rejected registration can't sign in even with the right password. Reset codes are random, hashed, single-use, expire after 30 minutes and lock after 5 wrong tries.
- Money is stored as integer paise. Every money change runs in a MongoDB transaction that also takes one shared lock, so concurrent saves queue up instead of interleaving. Payment saves are idempotent (a per-form key), monthly charges are unique per member-month in the database, claim confirmation is a guarded state change, and corrections are reversals/waivers with reasons — nothing financial is deleted.
- Exports are admin-only, never cached, and CSV cells are protected against spreadsheet formula injection.
- Rate limits trust `X-Forwarded-For` from the host (Vercel overwrites it with the real client address).
- The QR check-in is a convenience, not proof of presence; it is never tied to money or rewards.

## Project layout

```
src/app/(auth)        login, register, reset, pending
src/app/admin         Bharat's screens (+ export route, QR poster)
src/app/app           member screens
src/app/checkin       QR target
src/app/actions       server actions (auth, admin, member, common)
src/lib/ledger.ts     charges, payments, allocations, waivers, claims, status — the money rules
src/lib/engage.ts     attendance, goals, follow-ups, onboarding, help, challenges
src/lib/db.ts         MongoDB connection, collections, indexes, transactions
src/lib/auth.ts       Better Auth setup
src/lib/accounts.ts   sign-up/in via Better Auth, rate limits, reset codes
src/lib/i18n          en / mr / hi dictionaries
src/components/bits   React Bits animation components (vendored)
scripts/              demo seed, admin creation, billing run, backup, restore
tests/                business rules + HTTP access checks
```
