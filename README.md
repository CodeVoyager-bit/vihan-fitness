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
| Data | SQLite via `better-sqlite3` | One file, zero admin, trivial backups; fine for ~100 members |
| Auth | Phone + password, Node `scrypt` hashes, DB-backed sessions (httpOnly cookie, only a SHA-256 of the token is stored), per-phone/IP rate limits | No OTP/SMS cost; OTP can be added as an extra verification step later without touching sessions |
| UI | Tailwind CSS v4 design tokens, Lucide icons, Barlow / Barlow Condensed + Mukta / Anek Devanagari | Condensed athletic type with proper Devanagari |
| Motion | React Bits components (`src/components/bits`, vendored from reactbits.dev), `motion`, `gsap`, WebGL light rays | All respect `prefers-reduced-motion`; WebGL is client-only and pauses off-screen |

No paid services, no payment gateway, no messaging API. WhatsApp opens with a prefilled message and Bharat presses Send.

## Run it locally (demo data)

Requirements: Node.js 20+ and npm.

```bash
npm install
```

```bash
npm run demo:seed
```

```bash
npm run dev:demo
```

Open http://localhost:3000. The login page shows one-tap **demo accounts** (admin, member, pending registration) — these buttons exist only in demo mode. `demo:seed` also prints a password for the same accounts (set `DEMO_PASSWORD` to choose it).

The demo database lives at `~/.vihan-fitness/demo.db` and is rebuilt from scratch each time you run `demo:seed` (stop the dev server first, then start it again). It covers: fully paid, unpaid, partial, multiple unpaid months, advance payment, claim awaiting confirmation, claim linked to an existing payment, paused member with older dues, member who left, duplicate registration attempt, reversed payment, goal completed, and an open help request.

### Tests

```bash
npm test
```

33 business-rule tests on a fresh in-memory database: no duplicate monthly charges, partial / multi-month / advance payments, admin split overrides, idempotent payment saves, reversals and waivers, claims that can't clear a balance before confirmation or be confirmed twice, claim linking without double counting, pause/leave/resume, one visit per Asia/Kolkata day, goals, follow-up exclusions, phone normalisation, password hashing, login rate limits, reset codes.

```bash
npm run test:access
```

21 HTTP checks against a **running demo server** (`npm run dev:demo` in another terminal; set `BASE_URL` if it isn't on port 3000): anonymous visitors, pending registrations and members are refused admin pages and exports on the server, and member pages contain no other member's name or phone.

## Demo vs live

`APP_MODE` decides which database is used (`demo.db` or `vihan.db`), and the database remembers which mode created it — the app refuses to start if they don't match, so demo records can never mix with real ones. `demo:seed` refuses to write to a file whose name doesn't contain "demo". Demo mode shows a banner on every page, hides real phone numbers from WhatsApp/call links and enables the one-tap demo logins; none of that exists in live mode.

## Deploy (live)

The pilot fits on the smallest Linux VPS (1 vCPU / 1 GB). Any host that runs Node 20 and keeps a disk works; avoid "serverless" hosts because SQLite needs a persistent file.

1. **Server & code**
   ```bash
   git clone https://github.com/CodeVoyager-bit/vihan-fitness.git /opt/vihan-fitness
   ```
   ```bash
   cd /opt/vihan-fitness && npm ci && npm run build
   ```
2. **Environment** — copy `.env.example` to `.env.local` and set at least:
   `APP_MODE=live`, `DATABASE_PATH=/var/lib/vihan-fitness/vihan.db`, `APP_URL=https://your-domain`.
3. **Create Bharat's admin account** (there is no public admin sign-up):
   ```bash
   npm run admin:create -- --phone 98XXXXXXXX --name "Bharat Gite"
   ```
   It asks for the password (or reads `ADMIN_PASSWORD`). Run it again to reset the admin password.
4. **Start** with a process manager (systemd, pm2…):
   ```bash
   npm start -- -p 3000
   ```
5. **HTTPS** — put Caddy (automatic certificates) or nginx in front, e.g. Caddyfile: `your-domain { reverse_proxy localhost:3000 }`. Session cookies are `Secure` in production, so HTTPS is required.
6. **First login → More**
   - *Billing*: choose the **launch month** (nothing is charged before it) and the due day (default 10th). The fee schedule starts at ₹500 from the launch month.
   - *Public page*: fill in only confirmed details.
   - *QR codes*: print the check-in poster for the entrance and the registration poster.
7. **Cron** (`crontab -e`, server time):
   ```
   5 0 * * *  cd /opt/vihan-fitness && npm run billing:run   # optional: charges are also created on first visit each day
   30 2 * * * cd /opt/vihan-fitness && npm run backup        # consistent copy into ./backups, keeps 60
   ```
   Copy `backups/` off the server too (e.g. `rclone` to Google Drive). Bharat can also download CSVs or a full backup from **More → Export records**.

### Updating

```bash
git pull && npm ci && npm run build
```
then restart the service. The schema is created/extended automatically on start (`CREATE … IF NOT EXISTS`).

## Security notes

- Every page, server action and export calls a server-side guard (`requireAdmin` / `requireMember` in `src/lib/session.ts`). Member actions never accept a member id from the browser — it always comes from the session.
- Passwords: scrypt (N=16384, r=8, p=1) with per-user salt; reset codes are random, hashed, single-use, expire after 30 minutes and lock after 5 wrong tries.
- Money is stored as integer paise. Payment saves are transactional and idempotent (a per-form key), monthly charges are unique per member-month in the database, claim confirmation is a guarded state change, and corrections are reversals/waivers with reasons — nothing financial is deleted.
- Exports are admin-only, never cached, and CSV cells are protected against spreadsheet formula injection.
- Rate limits trust `X-Forwarded-For` from your reverse proxy; don't expose the Node port directly.
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
src/lib/accounts.ts   passwords, sessions, rate limits, reset codes
src/lib/i18n          en / mr / hi dictionaries
src/components/bits   React Bits animation components (vendored)
scripts/              demo seed, admin creation, billing run, backup
tests/                business rules + HTTP access checks
```
