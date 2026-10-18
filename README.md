# Office Attendance System

QR-based attendance app for a single office. Employees check in/out on their phones (PWA) or a shared kiosk; admins manage employees, shifts, holidays, leave, and monthly payroll. All business logic runs in **Asia/Dhaka** time (no DST); every date key is a `YYYY-MM-DD` string.

## Stack

- Next.js (App Router, React 19) + HeroUI + Tailwind v4
- MongoDB via the typed singleton in `src/lib/mongo.ts` (no ORM)
- better-auth (email + password; sign-up is disabled — users are provisioned by scripts)
- Deployable to Vercel; `vercel.json` schedules the daily cron

The domain engine (`src/attend/`) is pure TypeScript with no framework imports so it can run under plain Node type-stripping for tests.

## Setup

```bash
cp .env.example .env.local   # fill in real values; see the file for what each key does
npm install
node scripts/init-db.mjs     # indexes + seed shifts/employees/leave types/deduction rules
node scripts/seed-demo.mjs   # demo users only (optional, dev only)
DEMO_PASSWORD=<secret> node scripts/seed-passwords.mjs   # login users (better-auth scrypt)
```

Connection strings:

- `MONGODB_URI` in `.env.local` should be the **app user** (least privilege, see below).
- `MONGODB_ADMIN_URI` (only for `scripts/setup-app-user.mjs`) should be an owner-level Atlas user.

```bash
MONGODB_ADMIN_URI=... node scripts/setup-app-user.mjs
```

This creates a custom role: full find/insert/update/remove on every app collection, but **find + insert only** on `audit_log` (append-only enforced at the DB level, not just in code). If your Atlas tier does not allow driver-created custom roles, the script prints the manual Atlas UI equivalent.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/init-db.mjs` | Create indexes (incl. unique `daily_status {employee_id, date}`, TTL `used_tokens`) + seed deduction rules / leave types |
| `scripts/seed-demo.mjs` | Dev-only demo employees |
| `scripts/seed-passwords.mjs` | Login credentials for the seeded emails (requires `DEMO_PASSWORD`) |
| `scripts/setup-app-user.mjs` | Least-privilege app DB user + append-only audit lock |
| `scripts/test-status.ts` | Pure-engine boundary tests (`node scripts/test-status.ts`; no npm wiring) |

## How attendance works

- **Statuses** (`src/attend/status.ts`): manual > holiday > weekly off > approved leave > absent > present/late/half-day. Shifts may cross midnight; the working date of a scan is anchored by an overnight cutoff (`workingDateForScan` in `src/lib/time.ts`).
- **Materialization** (`src/attend/service.ts`): a `daily_status` row is upserted per employee/day (with scans, leave metadata, `late_min`). Cron materializes the previous day; admin actions re-materialize days they change. Manual rows are never overwritten by automated runs.
- **Check-in** (`src/app/api/check-in/route.ts`): single-use HMAC-signed QR tokens (~45s) minted by the kiosk; geofence + rate limits enforced; replay is deduped via `used_tokens`.
- **Leave** (`src/attend/leave.ts`): balances per leave type; requests validated for overlap + same-year range; admin approve/cancel/reject updates balances atomically; earned accrual is idempotent and recomputed year-to-date.
- **Payroll** (`src/attend/payroll.ts`): monthly sheet (`/admin/sheet`, CSV export) with deduction days from configurable rules; `/admin/close` freezes a month — closed months can't be edited.
- **Cron**: `POST/GET /api/cron/daily-status` (Vercel cron at 00:00 Dhaka, `0 18 * * *` UTC) requires `CRON_SECRET` and backfills up to 31 missing days per employee.

## Notes

- Lint: `npm run lint`; typecheck: `npx tsc --noEmit`.
- Demo login options are hidden when `NODE_ENV=production`.
- Treat any Mongo credentials that appear in git history (old `.env.example`) as compromised and rotate them.
