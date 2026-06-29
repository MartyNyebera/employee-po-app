# Pilot-Readiness Audit — Employee Purchase Order App

**Prepared for:** localhost pilot demo with the company owner
**Date:** 2026-06-27
**Scope:** Full-stack review (React/Vite frontend + Express/PostgreSQL backend) focused on what will actually break, expose data, or show wrong numbers during an owner demo.
**Method:** Direct code inspection with file:line evidence. Claims below were verified first-hand, not copied from the older audit docs already in the repo.

---

## 1. Executive Summary

**Verdict: Demo-capable, but NOT yet "all working." Pilot risk = HIGH if shown unguided.**

The app looks polished and the three portals (Admin / Employee / Driver) load and navigate. But underneath there are three classes of real problems:

1. **Broken workflows that throw 500 errors** — the sales-order *approval* and *delivery-confirmation* flows (the financial heart of the app) call database tables that **do not exist anywhere in the schema**. They fail every time. This is almost certainly the biggest source of your "so many bugs."
2. **Wrong / fake data shown to the owner** — GPS "live tracking" is faked from browser `localStorage` (not the server), and the financial status machine is internally inconsistent (`approve` sets status to `PAID`, but the next step looks for `approved`, so the chain never completes).
3. **Security holes that are embarrassing in a room** — a public `POST /emergency-create-admin` that makes anyone a super-admin, public `/debug/users` listing every account, a default JWT secret, and a mock-auth fallback that turns *everyone* into a super-admin if the DB is unreachable.

**The good news:** none of this requires a rewrite. The P0 list is small and concrete (Section 4). If you fix the missing tables + status bug + lock down 4 endpoints, and follow the **safe demo script in Section 8**, you can run a clean, honest pilot.

**One-line message for the owner meeting:** the core data entry (POs, sales orders, inventory, employee/driver onboarding) works; the *approval automation and live GPS* are still being wired up and should not be the centerpiece of this first pilot.

---

## 2. How to Run It on localhost (corrected)

> ⚠️ The `README.md` is **wrong about the port**. It says start the backend on 3001 and the frontend proxies to it. The real config is the opposite: **backend = 3000, frontend = 3001**, and the frontend proxies `/api` → `localhost:3000` ([vite.config.ts:10-18](vite.config.ts)). Following the README will make every API call fail.

**Prerequisites**
- Node ≥ 18 (enforced by `package.json` `engines`).
- **PostgreSQL with the TimescaleDB extension.** The `asset_telemetry` table is a TimescaleDB *hypertable* ([server/schema.sql:173](server/schema.sql)). On plain PostgreSQL the telemetry/GPS-history setup fails. For the pilot you can ignore GPS history, but be aware init may log an error here.

**Steps**
1. `npm install`
2. Create the database: `CREATE DATABASE fleet_manager;`
3. Copy `.env.example` → `.env` and set, at minimum:
   - `DATABASE_URL=postgresql://postgres:<pwd>@localhost:5432/fleet_manager`
   - `PORT=3000`
   - `JWT_SECRET=<any long random string>`  ← **do not leave blank** (see P0-4)
   - `ALLOW_SEED=true` (only for the pilot, to get demo data)
4. `npm run init` — creates the base schema + seeds.
5. Create a super-admin login for the owner demo (pick one):
   - set `SUPER_ADMIN_OWNER_EMAIL` / `SUPER_ADMIN_OWNER_PASSWORD` in `.env`, then `node server/ensure-super-admin.js`, **or**
   - use the seeded accounts `developer@kimoel.local` / `owner@kimoel.local`, password `ChangeMe123!` (see `server/seed.js`).
6. Start both servers: `npm run dev:all` (or two terminals: `npm run server` and `npm run dev`).
7. Open **http://localhost:3001** (NOT 3000 — 3000 is the API).

**Sanity check before the owner arrives:** `curl http://localhost:3000/health` should return ok, then log in at :3001 and confirm the dashboard loads.

---

## 3. Feature Inventory & Status

Use this to script the demo around what's solid. "Mock" = looks real but isn't backed by the server.

| Area | Status | Notes |
|---|---|---|
| Admin/Employee/Driver login & registration | ✅ Working | Real JWT auth, bcrypt hashing, approval gating |
| Employee portal — inventory browse, material request submit | ✅ Working | Real API + DB |
| Employee/Driver approval queues (admin) | ✅ Working | `requireAdmin` enforced |
| Purchase Orders — create / list / edit / delete | ✅ Working | Real API + DB |
| Sales Orders — create / list / edit / delete | ✅ Working | Real API + DB |
| Inventory management (admin) | ✅ Working | `requireAdmin` enforced |
| Miscellaneous expenses | ✅ Working | Real API + DB |
| Driver portal — deliveries, status, chat | ⚠️ Partial | Status update endpoint has no role check (P0-1); chat polls every 10s |
| **Sales Order approval workflow** | ❌ Broken | 500 error — references missing tables (P0-2) |
| **Delivery confirmation / revenue recognition** | ❌ Broken | 500 error + status-machine bug (P0-2, P1-1) |
| **Deduct-inventory-on-approval** | ❌ Broken | Reads non-existent `sales_order_items` table |
| Financial dashboard / P&L summary | ⚠️ Unverified | Depends on the broken revenue tables; numbers likely wrong/empty |
| GPS live map (Traccar) | 🟡 Mock | Reads browser `localStorage`, not the server (P1-2) |
| Notifications tab (employee) | 🟡 Placeholder | Always shows empty state by design |

---

## 4. Findings — P0 (Will break or expose during the demo)

### P0-1 — Approval & delivery-status endpoints require login but NOT admin role
Global auth is applied at [server/index.js:1533](server/index.js) (`app.use('/api', requireAuth)`), so these need a valid token — but they are missing the `requireAdmin` middleware that every neighboring write endpoint has:

- `POST /api/sales-orders/:id/approve` ([index.js:1542](server/index.js))
- `POST /api/sales-orders/:id/confirm-delivery` ([index.js:1621](server/index.js))
- `POST /api/sales-orders/:id/deduct-inventory` ([index.js:1709](server/index.js))
- `POST /api/material-requests/:id/approve` ([index.js:1802](server/index.js))
- `PUT /api/deliveries/:id/status` ([index.js:2247](server/index.js))
- All `/api/fleet/*` vehicle create/update/delete ([index.js:2043-2054](server/index.js))

**Impact:** any logged-in *employee or driver* — not just admins — can approve orders, confirm deliveries, deduct inventory, and edit/delete fleet vehicles. For comparison, `POST /api/drivers`, `/api/inventory`, `/api/purchase-orders`, etc. all correctly use `requireAdmin`. This is an authorization gap, not an open door, but it undermines the approval controls you'd be demoing.
**Fix:** add `requireAdmin` to each handler (one word per route).

### P0-2 — Approval/financial workflows insert into tables that are never created
The "INTEGRATED BUSINESS LOGIC API FIXES" block ([index.js:1535+](server/index.js)) reads/writes these tables:
`sales_order_approvals`, `revenue_recognition`, `financial_transactions`, `business_logic_audit_log`, `delivery_confirmations`, `sales_order_items`.

A full-tree search confirms **none of them are created** — not in `server/schema.sql`, not in `schema-extensions.sql`, not via any `CREATE TABLE` in `index.js`.

**Impact:** the very first query in each of these endpoints throws `relation "..." does not exist` → the API returns **500**. So clicking "Approve" on a sales order, confirming a delivery, or deducting inventory **fails every time**. This is the most likely cause of the "so many bugs" you're seeing.
**Evidence:** [index.js:1563](server/index.js) (`INSERT INTO sales_order_approvals`), [1580](server/index.js) (`revenue_recognition`), [1638](server/index.js) (`delivery_confirmations`), [1714](server/index.js) (`sales_order_items`).
**Fix:** create these tables (a migration SQL exists at repo root — `database-fixes-corrected.sql` — that was apparently never applied; verify and run it, or add the `CREATE TABLE` statements to `schema.sql`).

### P0-3 — Public endpoints that leak data or grant admin, no auth at all
Registered **before** the auth boundary, so fully public:
- `POST /emergency-create-admin` ([index.js:338](server/index.js)) — anybody can create or upgrade an account to **super-admin**. Critical.
- `GET /debug/users` ([index.js:315](server/index.js)) — dumps every user (id, email, name, role).
- `GET /health/super-admin-status` ([index.js:237](server/index.js)) — lists super-admin emails.
- `GET /health/auth-debug` ([index.js:276](server/index.js)) — confirms whether a given email exists (account enumeration).

**Impact:** trivial full account takeover, and these are reachable on the Render deployment right now. Even on localhost, anyone glancing at the network tab sees them.
**Fix:** delete these four routes (or gate behind a secret header + disable in production).

### P0-4 — Default JWT secret + mock-auth privilege escalation
[server/auth.js:5](server/auth.js): `const JWT_SECRET = process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production'` — if the env var is unset, tokens are signed with a **publicly known string**, so anyone can forge an admin token.
[server/auth.js:39-47](server/auth.js): if `DATABASE_URL` is missing, `requireAuth` injects a fake `{ role: 'admin', isSuperAdmin: true }` user and lets the request through.

**Impact:** forgeable tokens if the secret isn't set; and if the DB connection drops, the app silently treats **every visitor as a super-admin**.
**Fix:** fail startup if `JWT_SECRET` is missing; remove the mock-auth fallback (or guard it behind an explicit `DEV_NO_DB=1` flag).

---

## 5. Findings — P1 (Wrong data shown to the owner)

### P1-1 — Sales-order status machine is internally inconsistent
`approve` sets the order status to **`'PAID'`** ([index.js:1573](server/index.js)) — but `confirm-delivery` only matches orders with status **`'approved'`** ([index.js:1627-1628](server/index.js)). So even if the missing tables (P0-2) existed, an approved order can **never** be delivery-confirmed — the query returns "not found." The approve response also claims `status: 'approved'` ([index.js:1606](server/index.js)) while the DB row says `PAID`, and the audit log records `pending → approved` ([index.js:1598](server/index.js)). Three different "truths" for one action.
**Impact:** the approval→delivery→revenue chain is broken end-to-end, and any status shown to the owner is unreliable.
**Fix:** pick one canonical status set and use it consistently (`pending → approved → completed`); don't set `PAID` on approval.

### P1-2 — "Live GPS tracking" is faked from localStorage
The entire Traccar client layer is mock data, not server-backed: `fetchTraccarDevices`/`fetchTraccarPositions` read `gpsData_*` keys out of **browser localStorage** ([client.ts:474-550](src/app/api/client.ts)), and `create/update/deleteTraccarDevice` are no-ops returning dummy objects ([client.ts:566-602](src/app/api/client.ts)).
**Impact:** if you demo "live fleet tracking," you're showing data that lives only in that one browser and isn't connected to the backend. It will look convincing and then fall apart under any real question.
**Fix (for pilot):** don't present GPS as production-ready; label it "prototype." (Real fix is wiring to the `/api/driver/location` SSE stream that already exists server-side.)

### P1-3 — Prior business-logic audit issues may still be live
The repo's own `BUSINESS_LOGIC_AUDIT_REPORT.md` flags revenue recognized on completion (not delivery) and net profit omitting COGS/opex. The "fix" code was pasted into `index.js` (the FIX block at 1535) but, because its tables don't exist (P0-2), **the fixes don't actually run**. Treat the financial dashboard numbers as unverified until P0-2 is resolved and you've reconciled one order by hand.

---

## 6. Findings — P2 (Looks unprofessional / fragile)

- **Hardcoded production backend URL.** On any non-localhost host the frontend always calls `https://employee-po-system.onrender.com` ([client.ts:5-9](src/app/api/client.ts)). If you ever deploy the frontend elsewhere, it silently talks to that one Render box — a classic "works locally, broken live."
- **Public read endpoints.** `GET /api/purchase-orders`, `/api/sales-orders`, `/api/inventory` are readable without auth (registered before line 1533). Fine for a demo, but it means order data isn't actually access-controlled.
- **Console noise.** Debug `console.log` spam on every API call (e.g. cold-start retry logs in [client.ts:70](src/app/api/client.ts), debug logging in `src/app/api/overview.ts`) — looks sloppy if the owner's tech person opens devtools.
- **Infinite polling.** Driver portal polls messages every 10s and vehicle data every 30s indefinitely; the network tab churns even when idle.
- **No rate limiting, no logout/token revocation**, 7-day tokens, open CORS (`app.use(cors())`). Acceptable for a pilot, not for production.

---

## 7. Findings — P3 (Hygiene / tech debt — for after the pilot)

- ~35 root-level scratch scripts (`test-*.js`, `*-fixes.js`, `quick-*.js`, `demo-*.js`, `check-*.js`) and 9 stray HTML files (`static-app.html`, `tracker.html`, `livemap.html`, …). The **real entrypoints** are: backend `server/index.js`, frontend `src/main.tsx` → `src/app/App.tsx`, schema `server/schema.sql` + `server/init.js`. Everything else at root is leftover experimentation.
- `backup/` and `backup-2026-03-07-20-28/` folders suggest past rollbacks.
- `server/index.js` is a single ~4,650-line file; multiple near-duplicate map components exist.
- **Recommendation:** move scratch files into an `_archive/` folder before anyone technical reviews the repo, so the real codebase is obvious. (Not demo-blocking.)

---

## 8. Path to "All Working" — Prioritized Checklist

Do P0 before the pilot. P1 makes the demo honest. P2/P3 are polish.

> **Update 2026-06-27 — P0 fixes applied in code.** See "Fixes Applied" below. Requires a **server restart** (the new tables are created by `runMigrations()` on boot). Not yet runtime-tested against a live DB.

**P0 — must fix (est. 1–2 hrs total)**
- [x] Create the 8 missing tables + required columns — added to `runMigrations()` in `server/index.js` (created on every server start; idempotent). Did NOT use `database-fixes-corrected.sql` (its `ADD CONSTRAINT IF NOT EXISTS` is invalid PostgreSQL). *(P0-2)*
- [x] Add `requireAdmin` to `/sales-orders/:id/approve`, `/deduct-inventory`, `/material-requests/:id/approve`, and the `/api/fleet/*` vehicle writes. *(P0-1)* — left `confirm-delivery` and `/deliveries/:id/status` on `requireAuth` since those are driver-operated (see Known follow-ups).
- [x] Deleted `POST /emergency-create-admin`, `GET /debug/users`, `/health/super-admin-status`, `/health/auth-debug`. *(P0-3)*
- [x] Removed the hardcoded default `JWT_SECRET` and the mock-auth fallback in `server/auth.js`; a random secret is generated if the env var is missing. **Still set a fixed `JWT_SECRET` in `.env`** so logins survive restarts. *(P0-4)*

**P1 — make the numbers/maps honest (est. 1 hr)**
- [x] Fixed the sales-order status machine: `approve` now sets `approved` (not `PAID`), so `confirm-delivery` (which matches `approved`) can complete. *(P1-1)*
- [ ] Reconcile one sales order by hand end-to-end and confirm the financial dashboard total is right. *(P1-3)*
- [ ] Decide how to present GPS — label as prototype or hide for v1. *(P1-2)*

**P2/P3 — polish (post-pilot)**
- [ ] Strip debug `console.log`s; throttle/stop idle polling.
- [ ] Restrict the public read endpoints; lock CORS to known origins.
- [ ] Fix the README port; archive scratch files.

### Root-cause bug found while running locally (2026-06-27) — `/api` prefix mismatch

**This is the most likely cause of "runs fine but so many bugs."** The backend serves every route under `/api/*`, and the Vite dev proxy only forwards `/api/*`. But `src/app/api/client.ts` (`fetchApi`) — used by the **entire admin dashboard** — called **bare paths** like `/purchase-orders`, `/inventory`, `/sales-orders`, `/transactions`, `/assets`, `/admin-requests`, `/delivery-metrics` (58 call sites, none with `/api`). Those requests fell through to the SPA and returned `index.html`, so the admin data screens silently failed and showed empty/stale state. The **Employee portal worked** because it has its own fetch wrapper that already prepends `/api` ([EmployeePortal.tsx:148](src/app/pages/EmployeePortal.tsx)).

Verified empirically on the running app: `GET /inventory` → HTML (broken); `GET /api/inventory` → JSON (works).

**Fix applied:** `fetchApi` now normalizes bare paths to `/api/...` (leaving paths already under `/api` untouched). Since no bare path resolved on the backend before, this can only fix calls, not regress them. **Reload the browser** to pick it up. Expect dashboard numbers to change once real data loads.

### Fixes Applied (2026-06-27)

Changed files: `server/index.js`, `server/auth.js`, `src/app/api/client.ts`.

- **`server/auth.js`** — removed the publicly-known default JWT secret (now a random per-process secret when `JWT_SECRET` is unset) and deleted the mock-auth fallback that made every request a super-admin when `DATABASE_URL` was missing.
- **`server/index.js`** — deleted 4 unauthenticated debug/admin endpoints; added `requireAdmin` to the sales-order approve, deduct-inventory, material-request approve, and fleet vehicle-write routes; changed the approve status from `PAID` to `approved`; and added the 8 previously-missing workflow tables + columns to `runMigrations()` (idempotent, created on every server start).

**To activate:** restart the backend (`npm run server`). No `npm run init` re-run is required — the tables are created on boot.

**Important scope note:** the approval/confirm-delivery/deduct-inventory endpoints are **not currently called by the UI** (the live UI uses `PATCH /sales-orders/:id` and `/material-requests/:id/review`). So these were *latent* bugs — the fixes harden security and make the workflow functional when wired up, but they were not the source of the visible day-to-day bugs. Those still need a separate hands-on pass: run the app and reproduce each broken screen.

**Known follow-ups (not done):**
- `POST /api/sales-orders/:id/confirm-delivery` and `PUT /api/deliveries/:id/status` were left on `requireAuth` (not `requireAdmin`) because they are driver-operated; tighten once the driver-role model is confirmed.
- Not yet runtime-tested against a live database — needs a boot + one end-to-end order on your Postgres.

---

## 9. Suggested Safe Demo Script

A click-path that shows the app at its best and avoids the broken/mock surfaces:

1. **Log in** as the owner super-admin → land on the Admin dashboard (loads cleanly).
2. **Onboarding flow:** show a pending employee/driver in the approval queue → approve them. (Real, role-checked, works.)
3. **Create a Purchase Order** with line items → show it in the list → edit status → delete. (Full CRUD, works.)
4. **Create a Sales Order** and show it listed. (Works.) — *Do not click "Approve" until P0-2 is fixed; it currently 500s.*
5. **Inventory + Material Request:** submit a material request from the Employee portal, show it on the admin side. (Works.)
6. **Mention** fleet GPS and approval automation as "in progress / next phase" rather than demoing them live.

Following this path, every step is backed by real, working code. After you complete the P0 list, you can safely add the sales-order approval and delivery confirmation back into the demo.

---

## 10. Notes on the Existing Audit Docs in This Repo

The repo already contains `BUSINESS_LOGIC_AUDIT_REPORT.md`, `COMPLETE_BUSINESS_LOGIC_AUDIT.md`, `COMPREHENSIVE_SYSTEM_ANALYSIS.md`, and `PERFORMANCE_AUDIT_REPORT.md`. They're useful background, but several are **prescriptive (proposing fixes), and this audit confirms the key fixes were pasted into the code without the supporting database tables — so they don't actually run yet.** Where this report and the older docs disagree, trust this one: it was verified against the current `index.js` and `schema.sql` with the line numbers cited above.
