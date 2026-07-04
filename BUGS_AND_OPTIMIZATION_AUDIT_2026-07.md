# Kimoel — Bugs & Optimization Audit

**Date:** 2026-07-04
**Scope:** Runtime/functional bugs + performance/optimization across the whole app (React/Vite frontend, Express + PostgreSQL backend), including the new Work Schedule feature and the caching setup.
**Companion doc:** security/correctness/production items are in `WEB_APP_AUDIT_2026-07.md`; this doc focuses on functional bugs and optimization. Overlaps are noted.

---

## PART A — BUGS (ranked)

### CRITICAL
**B1. Driver "Arrived" button always 500s and desyncs the delivery/order.**
`DriverPortal.tsx:54` includes `'Arrived'` in the status flow. `PUT /api/deliveries/:id/status` passes it straight into `UPDATE sales_orders SET status='Arrived'` ([server/index.js:2352](server/index.js#L2352)), but the SO CHECK constraint ([284](server/index.js#L284)) doesn't allow `'Arrived'` → constraint violation → 500. The delivery row is updated *before* the SO sync throws (no transaction), so the delivery flips to Arrived but the order doesn't, and the driver sees "Failed to update status" after ~14s of retries. **Reproduces on every tap.**
*Fix:* add `'Arrived'` (and `'Pending'`) to the constraint or map it to an allowed value; wrap both writes in a transaction. *(Also in the correctness audit.)*

### HIGH
**B2. Sales-order delivery confirmation is dead code (status vocabulary mismatch).** Approve sets `status='PAID'` ([1651](server/index.js#L1651)); confirm-delivery requires `status='approved'` ([1706](server/index.js#L1706)) → always 400. Standardize the value.

**B3. Revenue recognized at approval, not delivery — double-counts if B2 is fixed.** Approve inserts a `REVENUE/CONFIRMED` txn ([1657-1670](server/index.js#L1657)); confirm-delivery inserts another ([1746](server/index.js#L1746)); dashboard sums both. Record PENDING at approval, single CONFIRMED at delivery.

**B4. Employee/driver review endpoints hang or 200-on-failure for a bad id.** `PUT /api/admin/employees/:id/review` ([4413](server/index.js#L4413)) never responds when the id doesn't exist (**request hangs** until proxy timeout). The driver version ([4503](server/index.js#L4503)) does `res.json(rows[0])` unconditionally → **HTTP 200 with empty body**, so `approveDriver()` "succeeds" and the admin UI removes the row though nothing was approved. *Fix:* `if (!rows.length) return res.status(404)`.

**B5. `fetchApi` retries non-idempotent POSTs on 5xx → duplicate records.** [client.ts:59-64](src/app/api/client.ts#L59) retries 500/502/503/504 for **all** methods (duplicated in DriverPortal/EmployeePortal). A POST that commits then errors afterward gets retried up to 3× → **duplicate sales/purchase orders, material requests, work tasks**. *Fix:* retry only GET/HEAD.

### MEDIUM
**B6. `deduct-inventory` — no transaction, no idempotency.** ([1787-1859](server/index.js#L1787)) A short-stocked line 400s mid-loop after earlier lines were already deducted (partial, no rollback); double-submit/retry double-deducts. Wrap in a transaction; short-circuit if `is_inventory_deducted`. *(Also in correctness audit.)*

**B7. Schedule start-date off-by-one (Postgres DATE → UTC).** Settings endpoints ([5117](server/index.js#L5117), [5137](server/index.js#L5137)) return the `DATE` as a UTC ISO string; `WorkScheduleList.tsx:51` does `.slice(0,10)`. In Asia/Manila (+8), a stored `2026-01-01` renders as **Dec 31** in the date input and skews the auto-week. *Fix:* `to_char(start_date,'YYYY-MM-DD')` in the SELECTs (same class affects other DATE columns). *(Previously flagged; still open.)*

**B8. Delivery driver link written as `driver_account_id` but read via `driver_id`.** `POST /api/deliveries` writes `driver_account_id` leaving `driver_id` NULL ([2291](server/index.js#L2291)); list/lookup join/filter on `driver_id` ([2244](server/index.js#L2244), [2374](server/index.js#L2374)). Result: such deliveries show `driver_name=null` and are **invisible** to the driver's own delivery lookup. Pick one linkage for both write and read.

**B9. Dead duplicate list routes hide the "enriched" handlers.** `GET /api/sales-orders` registered at [1012](server/index.js#L1012) (wins, no join) and [3122](server/index.js#L3122) (dead — the one returning driver/vehicle/deliveryStatus). Same shadowing for `/purchase-orders`, `/inventory`, `/miscellaneous`, `driver_deliveries`. Merge the join into the live handler, delete the dead ones.

### LOW
- **B10. Keyless Fragment in `WorkScheduleList.tsx:252`** — `phases.map(phase => (<>…))` logs a React key warning per phase. *Fix:* `<Fragment key={phase}>`. *(In the recently-added code.)*
- **B11. DriverPortal loading flash + GPS text/interval mismatch** — checks `deliveries.length===0` before `isDeliveriesLoading` ([432](src/app/pages/DriverPortal.tsx#L432)) so it flashes "No deliveries" on load; UI says "every 15 seconds" but the interval is **1000ms** ([161](src/app/pages/DriverPortal.tsx#L161)).
- **B12. EmployeePortal notifications permanently dead** — `unreadCount` never updated, Notifications view hardcoded empty ([EmployeePortal.tsx:121](src/app/pages/EmployeePortal.tsx#L121)); backend already writes notifications.
- **B13. `material-requests/:id/review` 500s (TypeError) for a missing id** instead of 404 ([4076](server/index.js#L4076)).

**Verified OK:** PO PATCH response shape, `/inventory` snake→camel mapping, work-schedule `/progress` week math, money `parseFloat` internal consistency.

---

## PART B — OPTIMIZATION (ranked)

### HIGH
**O1. No gzip/brotli — the 2.37 MB bundle ships uncompressed.** No `compression` middleware. *Fix:* `app.use(compression())` → ~2.37 MB → **~0.7 MB** over the wire. One line, biggest bang.

**O2. One 2.37 MB JS chunk, no code-splitting.** No `React.lazy`/`Suspense` anywhere; `vite.config.ts` has no `manualChunks` (the unused `vite.config.optimized.ts` already sketches the splits). Everything — recharts, leaflet, framer-motion, 31 Radix pkgs — loads before the **login screen**. *Fix:* lazy-load route screens + Leaflet/recharts, port the manualChunks config. Est. initial JS ~2.3 MB → **~400-600 KB**.

**O3. GPS write storm — ~5 queries/sec/driver.** `DriverPortal.tsx:161` posts every 1s; `POST /api/driver/location` runs up to 5 sequential queries/ping ([1480](server/index.js#L1480)). *Fix:* 5-10s interval + cache `vehicle_id` client-side + batch odometer writes → **~25× less DB load**. (Also fixes B11's copy mismatch.)

**O4. `driver_locations` grows unbounded — no retention.** ~86k rows/driver/day; the live query only reads the last 30 min. *Fix:* nightly delete older than 7 days (or partitioned/rolling table).

**O5. Missing composite index for the live-locations query.** `DISTINCT ON (driver_id) … ORDER BY driver_id, timestamp DESC` has only single-column indexes ([db.js:186](server/db.js#L186)). *Fix:* `CREATE INDEX ON driver_locations(driver_id, timestamp DESC)`.

**O6. `financial-summary` fires 5 sequential aggregate queries** ([1953](server/index.js#L1953)) on the dashboard hot path. *Fix:* `Promise.all` or one `FILTER`/CASE query → 5 round-trips → 1.

### MEDIUM
- **O7. Unbounded list endpoints (no LIMIT/pagination)** — PO/SO/inventory/deliveries/transactions each pull the whole table on every mount; no client cache. Add keyset pagination + indexes on the ORDER BY/filter columns.
- **O8. `?_t=${Date.now()}` cache-busting** on `/purchase-orders` & `/sales-orders` ([client.ts:245,354](src/app/api/client.ts#L245)) permanently defeats HTTP caching. Replace with server-side `Cache-Control: no-store` if freshness is needed. *(Band-aid from the earlier "no-cache CRUD" commit.)*
- **O9. ~7 dead heavyweight deps** — `@mui/material`+`@mui/icons-material`+`@emotion/*` (0 imports; app is on Radix), `react-slick` (0), `react-dnd*` (0), `react-responsive-masonry` (0), `motion` (0, alongside `framer-motion`). Remove to de-risk + speed CI.
- **O10. 740 KB logo PNG on the critical path** (`App.tsx:54` loading spinner), duplicated across `dist/` and `backup/`. Compress to ~15 KB WebP; drop the second unused logo. ~1.4 MB saved.
- **O11. Map components poll aggressively (5s) and don't pause when hidden.** Standardize to 15-30s, pause on `document.hidden`, one shared poller.
- **O12. Big list components re-map/re-sort every render** — `React.memo` in 0 files; lists are 1,700-2,000 lines. Memoize derived arrays, `React.memo` rows, virtualize (biggest payoff after O7 caps rows).

### LOW
- **O13. Per-request `console.log` on every API call** ([118-124](server/index.js#L118)) + verbose login logging — sync stdout on the hot path. Gate behind `NODE_ENV!=='production'`.
- **O14. Duplicate `/assets` static middleware + no-op logger + SPA-fallback `console.log`** ([4680-4701](server/index.js#L4680)).
- **O15. 29 near-duplicate map/GPS component files** inflate the build graph — keep the one that's routed, delete the rest. *(Also in frontend-quality audit.)*

---

## PART C — CACHING ("changes don't show even on hard refresh")

**Root causes (localhost):**
1. **`vite.config.ts` had `hmr: false`** — the dev server never pushed updates, forcing manual refreshes. ✅ **Fixed** (HMR re-enabled, Vite restarted).
2. **Viewing the built app on :3000** — that only updates after `npm run build`. → Develop against **:3001** (Vite).
3. **Stale `index.html` cached in the browser** — do a one-time DevTools → right-click reload → **"Empty Cache and Hard Reload."**

**Production caching bug (still open):** the SPA fallback that serves `index.html` for deep routes ([server/index.js:4700](server/index.js#L4700)) does **not** set `no-cache` headers (unlike the static handler at 4664). On Render this can serve a stale `index.html` pointing at an old bundle → the same "changes don't show" for live users. *Fix:* set `Cache-Control: no-cache, no-store, must-revalidate` on the fallback response.

---

## Top quick wins (high impact / low effort)
1. `app.use(compression())` — 2.37 MB → ~0.7 MB wire. (O1)
2. GPS interval 1s → 5-10s + cache vehicle_id. ~25× less DB load. (O3, fixes B11 copy)
3. Composite index `driver_locations(driver_id, timestamp DESC)` + 7-day retention. (O4, O5)
4. `to_char()` the schedule (and other) DATE columns — fixes the date off-by-one. (B7)
5. Retry only GET/HEAD in `fetchApi` — stops duplicate-record creation. (B5)
6. `if (!rows.length) return res.status(404)` on the review endpoints. (B4)
7. Add `no-cache` headers to the SPA fallback. (Part C prod bug)

## Suggested fix order
**Now:** B1 (driver Arrived), B4 (review 404), B5 (retry duplicates), the Part C prod cache header, O1 (gzip).
**Next:** B2/B3/B6 (order/revenue/inventory state machine — do together in transactions), O3/O4/O5 (GPS), B7 (dates).
**Then:** O2/O10 (bundle + assets), O7 (pagination), B8/B9 (delivery linkage + dead routes), the low-severity UI bugs (B10-B13), O9/O12/O15 (deps, memoization, dead files).
