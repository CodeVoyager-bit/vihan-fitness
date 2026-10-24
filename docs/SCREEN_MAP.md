# Vihan Fitness — screen map & key assumptions

## Screen map

```
Public
  /                     Animated landing page (content editable in Admin → Settings)
  /register             Name, phone, password, language  → /pending
  /login                Phone + password (demo mode: one-tap demo accounts)
  /reset                Phone + one-time code from Bharat + new password
  /pending              "Waiting for Bharat sir" (no member data reachable)
  /checkin?k=…          QR target at the gym door → confirm today's visit

Member  (bottom nav: Home · Visits · Fees · Profile)
  /app                  Greeting, monthly goal ring, check-in, fee status, "I have paid",
                        "Need help with my routine", challenge, first-week checklist
  /app/attendance       Month calendar of recorded visits, goal picker
  /app/fees             Outstanding / credit, month-by-month charges, payments, claims
  /app/fees/claim       "I have paid" claim form
  /app/help             Help requests (create + status)
  /app/profile          Language, follow-up preference, password, sign out

Admin  (bottom nav: Today · Members · [+ Record] · Inbox · More; sidebar on desktop)
  /admin                Received this month, outstanding, overdue, claims, approvals,
                        active count, primary actions, follow-ups, recent activity
  /admin/members        Search + filters, balance & this-month state, pay/call/WhatsApp
  /admin/members/[id]   Profile, status & history, ledger, payments, claims, visits,
                        reminders, checklist, audit trail, reset code
  /admin/pay            Record payment: member → amount/date/method → allocation
                        preview → confirm → saved receipt
  /admin/inbox          Claims · Approvals · Help requests (counts)
  /admin/claims         Confirm / link to existing payment / reject with reason
  /admin/approvals      Approve with billing start month + verified opening dues
  /admin/followup       Inactive-member list (threshold, opt-outs, cooldown)
  /admin/help           Help requests: acknowledge / resolve
  /admin/challenge      Monthly challenge from templates, participants
  /admin/more           Settings, public page text, fees, QR posters, exports, billing run
```

## Key assumptions (change in Settings or tell us)

- **Billing**: calendar month, ₹500, due on the **10th** (setting). A charge is *outstanding*
  from the 1st and *overdue* after the due date. Charges store their own amount, so a future
  fee change never rewrites history.
- **Launch month** is chosen at setup; nothing is charged before it. Older balances exist only
  when Bharat enters them as verified opening dues during approval.
- **Advance payments** stay as credit and are applied automatically when the next month's
  charge is created — no artificial overdue balance. Leftover money always goes to the oldest
  unpaid charge first; Bharat can override the split when recording.
- **Pause / Leave** take an effective month. Unpaid monthly charges from that month on are
  waived automatically (reason recorded); anything earlier stays owed. Resuming reverses
  those automatic waivers.
- **Corrections** are never deletes: payments are reversed with a reason, waivers can be undone,
  and every financial action writes an audit event.
- **Check-in** is self-reported ("recorded visits"), one per member per Asia/Kolkata day, only
  for active members. It never affects fees.
- **WhatsApp** opens a prefilled message; Bharat presses Send. The app records "opened", never
  "sent".
- **Single gym, single admin.** Admin accounts are created from the command line only.
- **Hosting**: one small Node server with a SQLite file (cheap, simple backups). Demo and live
  use different database files and the app refuses to mix them.
