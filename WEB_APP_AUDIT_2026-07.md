# Kimoel — Full Web App Audit

**Date:** 2026-07-04
**Scope:** Whole app — security, backend correctness/business logic, frontend code quality, production readiness.
**Method:** Four parallel deep-reads of the actual code (Express backend `server/index.js` ~5,100 lines + `server/*`, 172 frontend files in `src/`, deploy config, SQL).

## Verdict

**Not production-ready, and not safe for real multi-user data yet.** The app demos well and has a salvageable core, but three categories block a real rollout:

1. **Security** — live secrets committed to git, and an auth-middleware ordering bug that leaves dozens of endpoints (including admin/PII/DDL) fully unauthenticated.
2. **Financial correctness** — revenue is double-counted on one path and never recorded on another; there are no database transactions anywhere, so money/stock writes can partially fail.
3. **Ops** — four conflicting deploy targets, a health-check that points at a non-existent route (restart loop), and a 1-second GPS write storm.

Fix the Critical list before the app touches real customers, real money, or the public internet.

---

## CRITICAL — fix before any real use

### C1. Live production secrets are committed to git
`backup/env-final.txt` (tracked) contains **real** credentials: Gmail SMTP app password, DB password (`Kimoel123`), and super-admin passwords/emails. The working `.env` is correctly gitignored, but this backup copy defeats that. Anyone with repo access can send mail as the owner, log in as super-admin, and reach the DB.
**Fix:** `git rm` the `backup/*-final.*` files, purge from history (`git filter-repo`), and **rotate every leaked secret** — Gmail app password, DB password, JWT secret, both super-admin passwords.

### C2. Auth middleware is registered *after* most routes → dozens of unauthenticated endpoints
`app.use('/api', requireAuth)` sits at `server/index.js:1576`. Express only applies it to routes declared *after* it, so everything above 1576 is public — including:
- `GET /api/admin/drivers/accounts` (1558) — dumps every driver's name, email, phone, license number, no token.
- `PUT /api/admin/drivers/:id/assign-vehicle` (1523) — anyone reassigns vehicles.
- `POST /api/driver/location` (1445) — anyone injects GPS for any driver and inflates odometers.
- `POST/GET /api/admin/migrate-approval-columns` (1370/1401) — **unauthenticated `ALTER TABLE`** (comment literally says "public access").
- All `/api/phone-location*` and the `/api/mobile` GPS router.

**Fix:** Move `app.use('/api', requireAuth)` above all `/api` route definitions; explicitly whitelist the genuinely public ones (`/api/auth/login`, the `*/register` and `*/login` routes, and an unauthenticated `/api/health`). Add a role check (`requireAdmin`) to every `/api/admin/*` route.

### C3. Hardcoded JWT secret fallback + auth-bypass "mock admin"
- `server/auth.js:5` — `JWT_SECRET = process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production'`. If the env var is ever unset, tokens are signed with a public, git-committed string → anyone can forge an admin/super-admin JWT. (`simple-server.js:56` is worse: `'simple-secret-key'`.)
- `server/auth.js:37-48` — if token verification fails **and** `DATABASE_URL` is unset, `requireAuth` injects a full super-admin user and calls `next()`. A misconfigured deploy turns the whole API into an unauthenticated admin console.

**Fix:** Remove both fallbacks. Fail fast at boot if `JWT_SECRET`/`DATABASE_URL` are missing. Delete/quarantine `simple-server.js` and `simple-auth.js` (the latter ships hardcoded plaintext logins) so they can't be deployed.

### C4. Revenue is double-counted (recognized on approve AND on delivery)
`server/index.js:1630` inserts a `financial_transactions` REVENUE row on **approve**; `server/index.js:1711` inserts a **second** REVENUE row on **delivery confirmation** for the same order. The dashboard sums all confirmed REVENUE (`1920-1925`) with no dedupe → a ₱100,000 order shows ₱200,000 revenue and inflated net profit.
**Fix:** Recognize revenue exactly once — write the single REVENUE transaction at delivery confirmation (or UPDATE the existing row instead of INSERTing a second).

### C5. The approve → deliver → revenue chain is actually broken (dead flow)
`server/index.js:1614` sets `sales_orders.status = 'PAID'` on approval, but `confirm-delivery` (`1671`) only matches orders with `status = 'approved'` — a value **no code path ever sets**. So `confirm-delivery` always 400s and its revenue step never runs. Meanwhile the *real* completion path (`PUT /api/deliveries/:id/status`, `2317`) sets the order straight to `completed` and records **no** revenue/COGS at all. Depending on which path runs, revenue is either double-counted (C4) or never recorded.
**Fix:** Pick one lifecycle. Make approve set `approved` (or make confirm-delivery accept `PAID`), and make one status route the single trigger for revenue recognition.

### C6. No database transactions anywhere — money/stock writes can partially fail
`server/db.js:25-32` exposes only a single-shot `query()`; no `BEGIN/COMMIT/ROLLBACK` helper exists and no financial route uses one. Approve (`1605-1642`) and `deduct-inventory` (`1783-1824`) each do 4+ independent writes on possibly-different pooled connections. Any mid-sequence failure leaves inventory reduced but COGS/order totals wrong, with no rollback.
**Fix:** Add a `withTransaction` helper (`pool.connect()` → `BEGIN` → … → `COMMIT`/`ROLLBACK`) and run each lifecycle operation's statements on that one client.

### C7. `deduct-inventory` has no idempotency guard → double-deducts stock & COGS
`server/index.js:1752` never checks `is_inventory_deducted` or order status before running. A retry or double-click deducts inventory again and inserts another COGS row each time — stock silently goes negative and COGS is inflated N×.
**Fix:** `SELECT is_inventory_deducted … FOR UPDATE` at the top, return early if already done, and set the flag inside the same transaction. (Also validate all line items *before* deducting any — currently `1763-1804` deducts items 1–2 then 400s on item 3 with no rollback.)

---

## HIGH

### H1. Privilege self-assignment on open registration (mass assignment)
`POST /api/auth/register` (`server/index.js:641`, public) trusts the client-supplied `role`. Only `role==='admin'` is approval-gated; any other value (`purchasing`, `bookkeeper`, `office_admin`) is inserted directly — exactly the roles `requireRole([...])` grants write access to orders/suppliers/customers. Instant elevated staff access, no approval.
**Fix:** Never accept `role` from the body on public registration; force a safe default server-side and assign privileged roles only via an authenticated admin endpoint.

### H2. Admin driver-management routes missing role check
`GET /api/admin/drivers/pending` (4425), `GET /api/admin/drivers` (4441), `PUT /api/admin/drivers/:id/review` (4457) sit below line 1576, so they require *a* token but no role. Any logged-in employee or driver can list all driver PII and **approve/reject driver accounts**. The parallel employee routes correctly use `requireAdmin`, so this is an inconsistency.
**Fix:** Add `requireAdmin` to all three (and gate `POST /api/init`, 3925).

### H3. Unrestricted file upload → stored XSS + path traversal
Multer config (`server/index.js:30-42`) sets only a 10 MB size cap — no `fileFilter`, no MIME/extension whitelist. Uploads are served from the app's own origin (`/uploads`, 4519), so `evil.html`/`.svg` gives same-origin stored XSS. `filename` uses raw `file.originalname`, so a crafted multipart filename with `../` can traverse out of `public/uploads`.
**Fix:** Add a MIME/extension whitelist; generate the stored filename yourself with `path.basename`/`path.extname`; serve uploads with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`. (Note: local disk is also ephemeral on Render/Railway — uploads vanish on redeploy. Move to object storage.)

### H4. Race conditions allow negative stock / overselling
Stock is read, checked in JS, then decremented with no `SELECT … FOR UPDATE` and no DB `CHECK (quantity >= 0)` (`1764-1786`, `2378`). Two concurrent deductions both pass the check and both subtract → negative inventory. The app even has an endpoint that *reports* negative inventory after the fact (`2054`), implying this happens.
**Fix:** Lock the row `FOR UPDATE` in a transaction and add `CHECK (quantity >= 0)`.

### H5. Illegal state transitions corrupt orders & finances
- `'Arrived'` delivery status (`2293`) is written into `sales_orders.status` (`2317`) but violates the SO CHECK constraint (`284`) → 500 + split state.
- Cancelling a delivery resets the linked order all the way to `pending` (`2317`) even if approved/completed, **without reversing recognized revenue** — a financial leak.
- `PATCH /api/sales-orders/:id` (`3357-3399`) writes any status straight through with zero transition validation (e.g. `pending → completed`, skipping approval/revenue).
**Fix:** Define a legal-transition map, align the delivery/SO status vocabularies, and post compensating financial entries on cancel/reverse.

### H6. Finance endpoints depend on tables the migrations never create
The approve/confirm-delivery/deduct-inventory/financial-summary routes require `revenue_recognition`, `financial_transactions`, `sales_order_items`, `inventory_transactions`, `business_logic_audit_log`, etc. — defined only in `database-fixes-corrected.sql` / `quick-fix.js`, which are **never executed** by `runMigrations()` or `init.js`. On a fresh deploy these endpoints 500 on "relation does not exist."
**Fix:** Fold those DDLs into the boot migration as idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, or delete the dead endpoints.

### H7. Duplicate route registrations shadow the intended handlers (dead code)
`/api/sales-orders` is registered at both `977` and `3087`; `/api/purchase-orders` at `933` and `2727`; `/api/miscellaneous` at `1050` and `3649`. Express runs the first and never reaches the second. The *shadowed* sales-orders handler (3087) is the one that JOINs driver/vehicle/delivery info — so the UI never gets delivery linkage from that endpoint.
**Fix:** Delete the dead duplicates; keep the intended (joined) handlers.

### H8. Four conflicting, incompatible deploy targets
`render.yaml` (two services — API + a separate static site, though `server/index.js:4523` *also* serves `dist/`), `vercel.json` (serverless — **cannot** work: persistent `pg.Pool`, disk uploads, boot migrations, 1 Hz GPS writes), `railway.toml`, `Procfile`, and `DEPLOYMENT.md` (a fifth VPS+PM2 story with the ports reversed). No single source of truth.
**Fix:** Pick **one** always-on container that runs `node server/index.js` serving both API and static `dist/`. Delete `vercel.json` and the redundant Render static service.

### H9. Health check points at a non-existent route → restart loop
`railway.toml:5` uses `healthcheckPath = "/api/health"`, but the server only defines `GET /health` (`136`); `/api/*` is 401-gated anyway. With `ON_FAILURE` + 10 retries this causes crash-restart loops.
**Fix:** Use `/health`, or add an unauthenticated `GET /api/health` above the auth gate.

### H10. 1-second GPS write storm with a 4–5 query fan-out and an unbounded table
`DriverPortal.tsx:161` POSTs a location **every second** per driver; `POST /api/driver/location` (`1445-1498`) does ~5 sequential DB round-trips per ping (select prev → insert → select vehicle → update odometer → insert odometer_log). At the `railway.toml` box (0.5 cpu, pool 25) ~10 drivers saturate the pool. `driver_locations` is never pruned (~86k rows/driver/day forever).
**Fix:** Raise the interval to 5–10s, collapse the write path into one statement/short transaction, add a retention job, and add a composite index `(driver_id, timestamp DESC)` for the live query.

---

## MEDIUM

- **M1. Money computed as JavaScript floats** — COGS/margins accumulate in JS `number` (`1775`, `1811`) then round-trip through `NUMERIC` columns; centavo drift compounds across lines. Do money math in SQL / a decimal type. *(index.js:1775-1811)*
- **M2. Dashboard summary is current-month-only but presented as totals, and is timezone-fragile** — `DATE_TRUNC('month', … ) = DATE_TRUNC('month', CURRENT_DATE)` silently drops prior months; `NOW()` timestamptz vs `CURRENT_DATE` buckets boundary orders wrong. *(1918-1980)*
- **M3. Maintenance expense understated** — `operational_costs` MAINTENANCE rows are written but the summary reads maintenance from a *different* table (`maintenance_records`), so those expenses never hit net profit. *(1940 vs 1993)*
- **M4. Deleting a sales order orphans deliveries + financial rows** — bare `DELETE` (`3442`), no FK on `deliveries.so_number`, no reversal of REVENUE/COGS rows → dashboard keeps summing revenue for a deleted order.
- **M5. No rate limiting / no `helmet`** — login and register endpoints accept unlimited attempts (brute-force, account flooding). Add `express-rate-limit` + `helmet`.
- **M6. Wide-open CORS + weak CSP** — `app.use(cors())` reflects any origin (`57`); CSP allows `unsafe-inline`/`unsafe-eval` (`62-73`), negating XSS protection. Restrict CORS to known origins; drop the unsafe CSP directives.
- **M7. Verbose logging leaks data; errors return raw messages** — login logs every user's email/role (`713-722`); handlers return `err.message` to clients (`697`, `791`, `1190`); `/health/env` (`150`) exposes which secrets are set.
- **M8. No graceful shutdown; uncaught exceptions are swallowed** — `uncaughtException`/`unhandledRejection` log and continue (`11-19`); no SIGTERM handler, no `server.close()`/`pool.end()`. Add drain-on-SIGTERM; log-then-exit on uncaught.
- **M9. Boot migrations race and run raw DDL on every start** — `createNewTables()` (`db.js:46`) and `runMigrations()` (`index.js:209`) both fire at boot and each swallow errors; no versioning, idempotency relies solely on `IF NOT EXISTS`. Consolidate to one versioned migration step. Also: schema drift — `inventory`/`sales_orders` are defined differently in `schema.sql` vs the boot migration.
- **M10. Unbounded list endpoints + serial dashboard aggregates** — sales/purchase orders, inventory, transactions, deliveries return full tables (no LIMIT/pagination, e.g. `2747`); the financial summary fires 5 sequential aggregate queries (`1918`). Add pagination; batch/`Promise.all` the aggregates.
- **M11. `console.log` is the entire observability strategy** — per-request logging on the hot path (fires on every GPS ping), no structured logs/levels, no error tracking, no documented DB backups. Add pino + an error tracker (Sentry).

---

## LOW / cleanup

- **L1. Frontend ships as a single 2.34 MB un-split bundle** — no `React.lazy`/`Suspense` anywhere, no `manualChunks`. A better `vite.config.optimized.ts` exists but is unused. Adopt route-level lazy loading + vendor chunking. *(dist/js/index.CztiBHJa.js, vite.config.ts)*
- **L2. ~42 dead component/page files** never imported — 25 dead map/GPS variants (only `WorkingMap` is live!), 3 dead chart variants, dead `BusinessOverview-*`, `EmployeePortal-Professional/-Test`, plus `.backup`/`.bak` files. Delete them; verify with a build.
- **L3. ~10 unused heavyweight deps** — `@mui/material` + `@mui/icons-material` + Emotion (0 usage; app is on Radix + Tailwind), `motion` (0, alongside `framer-motion`), `react-slick`, `react-dnd(+backend)`, `react-responsive-masonry`, `next-themes`, popper. Removing these is a large `node_modules`/bundle win.
- **L4. Filename-based versioning** — `-Professional`, `-Fixed`, `-Updated`, `-Simple`, `-InlineStyles` suffixes encode git history in filenames; 4 `PurchaseOrderList*` variants (2 live). Rename the canonical one to its base name, delete the rest.
- **L5. Two parallel dashboards maintain divergent component variants** — `Dashboard.tsx` (plain) vs `AdminDashboard.tsx` (`-Professional`); a bug fixed in one won't reach the other. Consolidate to one component-per-entity.
- **L6. Duplicated fetch/loading/error logic per component** — no shared data hook; `AppContext.tsx` and `hooks/useCache.ts` exist but are imported by zero components (dead abstractions). Add one `useResource` hook (or TanStack Query).
- **L7. 1,849 inline `style={{}}` props + 4 overlapping styling systems** (Tailwind + 2 global CSS + inline). Standardize on Tailwind; split the god components (SalesOrdersList-Professional is 2,006 lines).
- **L8. 46 loose root scripts** (`*-fixes.js`, `test-*.js/.html`, `demo-*.js`, `static-app.html`, …) unreferenced by the build. Move to `dev-tools/` or delete; gitignore `dist/`, `*.backup*`, `*.bak`.
- **L9. 242 `any` occurrences** (concentrated in `api/overview.ts`, the big list components). Good news: 0 `@ts-ignore`. Type the API response shapes.
- **L10. Short JWT expiry inconsistency & bcrypt cost** — admin tokens 7d, employee/driver 24h, no refresh/revocation; bcrypt 10 rounds (consider 12 for admins). `db.js:22` `ssl.rejectUnauthorized:false` disables cert validation.

---

## Recommended remediation order

**Phase 0 — stop the bleeding (do today):**
1. Rotate all leaked secrets + purge `backup/env-final.txt` from history (C1).
2. Move `requireAuth` above the `/api` route table; add `requireAdmin` to `/api/admin/*` (C2, H2).
3. Remove the JWT fallback + mock-admin bypass; fail-fast on missing env (C3).
4. Delete the public migration/DDL endpoints (part of C2).

**Phase 1 — make the money correct:**
5. Add a transaction helper and wrap approve/deliver/deduct (C6).
6. Fix double revenue + unify the broken status chain (C4, C5); add idempotency + row locks (C7, H4).
7. Create the finance tables in migrations, or delete the dead finance endpoints (H6); remove duplicate routes (H7).
8. Validate state transitions; reverse revenue on cancel (H5).

**Phase 2 — make it deployable:**
9. Pick one deploy target; fix the health check (H8, H9).
10. Throttle GPS + add retention/index; paginate lists; graceful shutdown (H10, M8, M10).
11. Lock down CORS/CSP, add rate limiting + helmet, fix upload validation & object storage (M5, M6, H3).

**Phase 3 — pay down debt:**
12. Delete dead files + unused deps; code-split the bundle; consolidate dashboards; extract a data hook (L1–L8).

### What's already done right
Parameterized SQL everywhere (no injection); bcrypt password hashing; generic "invalid credentials" on the employee/driver login flows; a centralized API client with retry + 401→logout; deactivated-account blocking at login; coordinate validation on GPS. The core is salvageable — the problems are fixable without a rewrite.
