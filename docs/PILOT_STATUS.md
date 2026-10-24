# Pilot status

Everything below runs for real: data is persisted in MongoDB Atlas, sign-in is enforced on the server, and no action shows success before the database has committed it. Nothing is mocked.

## Acceptance criteria

| Criterion | Status | How it's verified |
| --- | --- | --- |
| Member registers, Bharat approves | ✅ | `/register` → `/pending`; Inbox → Registrations → Approve (billing start month, verified opening dues). Rule tests: approval bills from the start month; can't approve twice |
| Unapproved users can't reach member records | ✅ | Access tests: pending accounts are redirected from every member/admin page and export |
| Members see only their own data | ✅ | Member pages/actions take the id from the session only; access test scans member pages for any other member's name or phone |
| Partial, full and multi-month payments | ✅ | Record payment shows the split live, oldest month first, admin override; rule tests for each case |
| Claims don't clear balances before verification | ✅ | Rule test: balance unchanged until confirmed |
| A claim can't create duplicate payments | ✅ | Guarded state change + idempotency key per claim; "link to existing payment" path; rule tests |
| Monthly billing can't duplicate charges | ✅ | Unique index per member-month in the database; rule tests run billing repeatedly |
| Pausing stops future charges, keeps older dues | ✅ | Effective-month status history; unpaid charges from that month are waived with a recorded reason; rule tests for pause, leave and resume |
| WhatsApp opens the right message and recipient | ✅ | `wa.me/91XXXXXXXXXX?text=…` with a preview in English/मराठी/हिन्दी; logged as "opened", never "sent". Demo mode opens without a recipient |
| One attendance entry per local day | ✅ | Unique (member, Asia/Kolkata date); rule test on the IST midnight boundary |
| Goals update from recorded attendance | ✅ | Ring, calendar and challenge progress are computed from recorded visits |
| All three languages across main flows | ✅ | Every screen, status, error and WhatsApp template uses the shared dictionaries (`src/lib/i18n`) |
| Financial corrections stay traceable | ✅ | Reversals and waivers with reasons, never deletes; audit history per member |
| Bharat can export records | ✅ | More → Export records: CSVs + full database backup (admin-only); `npm run backup` for scheduled copies |
| Comfortable on a small phone | ✅ | Designed and checked at 375 px: bottom navigation, 44 px targets, bottom sheets with swipe-down |

Test suites: `npm test` (33 business-rule tests) and `npm run test:access` (21 HTTP access checks against a running demo server). Both pass.

## Needs Bharat's input before launch

- Gym description, trainer introduction, timings, address + map link, public phone/WhatsApp, joining charges/conditions, "running since" year — enter in **More → Public page**. Until then the public page shows clearly marked placeholders; nothing has been invented.
- Real gym photographs (the gallery shows "Real photo coming soon" tiles).
- Launch month, due day (default 10th) and the opening balances he has verified from the notebook.
- A native Marathi and Hindi speaker should read through the translations once (they were written carefully but not reviewed by a local speaker).

## Integration still required

- **Hosting**: Vercel + a MongoDB Atlas cluster in Mumbai, and a domain. See README → Deploy.
- **Off-site backups**: schedule `npm run backup` and copy the `backups/` folder somewhere else (e.g. Google Drive via rclone).
- **Optional later**: OTP sign-in (an SMS provider such as MSG91) as an extra verification step — sessions and accounts don't need to change. Not part of the pilot by design.

## Known limits (deliberate for the pilot)

- QR check-in is an honour system: anyone with the poster link can check in for themselves. It's used for goals and encouragement only, never for money or rewards. The code can be rotated (More → QR codes).
- If a member had already paid ahead for months they later pause, that money stays on those months. To refund, reverse the payment and record the correct one.
- Money left over after an admin's custom split stays as advance credit and is applied to the oldest unpaid month when the next month is billed.
- App screens are light-only (designed for daylight use on the gym floor); the public page is dark.
- Offline: the app shows an offline banner and blocks nothing silently, but changes need a connection to save — there is no offline queue.
- One gym, one admin account. Atlas's free tier comfortably covers the pilot; balances are computed in memory per request, which suits hundreds of members (switch to aggregation pipelines if it ever reaches tens of thousands).
- No Content-Security-Policy header yet (other security headers are set); worth adding once the hosting domain is final.
