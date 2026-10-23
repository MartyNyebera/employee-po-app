// ============================================================================
// GET /api/accounting/overview — everything the Accounting "OVERVIEW SYSTEM" screen shows, computed here.
// The browser only formats. "Today" is Asia/Manila throughout.
//
//   cards   five headline figures, each defined exactly like its own report (see the notes at each one)
//   alerts  things that need attention: due within 7 days / today / overdue (payday: within 3 days)
//   noDueDate  open items that have no date to watch, with a link to where the date is entered
//
// Read-only. Registered from index.js after every const it reads has been initialised.
// ============================================================================

const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => (c / 100).toFixed(2);
const utc = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const monthOf = (ymd) => ymd.slice(0, 7);
const addDays = (ymd, n) => new Date(utc(ymd) + n * 86400000).toISOString().slice(0, 10);
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export const HORIZON_DAYS = 7;
export const PAYDAY_DAYS = 3;
export const ALERT_TYPES = ['receivable', 'payable', 'project', 'trading', 'payday'];
export const NEXT_DAYS = 14;

export function registerAccountingOverview(app, d) {
  const { query, requireRole, reportRoles, BI_SELECT, mapBillingInvoice, PAYABLE_SELECT, mapPayable, collectionsWhere, pcfData, backToWorkdayYMD } = d;

  const manilaToday = async () => (await query(`SELECT to_char((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS d`)).rows[0].d;

  // Same rows each report starts from.
  const loadInvoices = async () => (await query(`${BI_SELECT} ORDER BY bi.bi_date DESC, bi.id DESC`)).rows.map(mapBillingInvoice);
  const loadPayables = async () => (await query(`${PAYABLE_SELECT} ORDER BY COALESCE(po.doc_date, po.created_date) DESC, po.po_number DESC`)).rows
    .map(mapPayable).filter((x) => !x.unpayable || x.paymentCount > 0);

  // Projects that are not Completed (Active / On Hold) and trading deals that are neither Completed nor delivered.
  // A trading deal counts as delivered once it has at least one non-voided Delivery Receipt.
  const loadProjects = async () => (await query(
    `SELECT id, name, status, client, to_char(target_completion_date, 'YYYY-MM-DD') AS target FROM projects ORDER BY name`)).rows;
  const loadTradings = async () => (await query(
    `SELECT t.id, t.name, t.status, t.client, to_char(t.expected_delivery_date, 'YYYY-MM-DD') AS expected,
            EXISTS (SELECT 1 FROM delivery_receipts dr WHERE dr.trading_id = t.id AND dr.voided_at IS NULL) AS delivered
       FROM tradings t ORDER BY t.name`)).rows;

  // Paydays: the 15th and the month's last day, each moved BACK to the nearest workday (not Sunday, not a holiday) --
  // the same rule the pay-period date suggester uses.
  const holidaySet = async () => new Set((await query(`SELECT to_char(holiday_date,'YYYY-MM-DD') AS d FROM holidays`)).rows.map((r) => r.d));
  const paydaysOf = (ym, hs) => [
    { date: backToWorkdayYMD(`${ym}-15`, hs), label: '1st cutoff payday' },
    { date: backToWorkdayYMD(lastDay(ym), hs), label: '2nd cutoff payday' },
  ];

  // ---- the alert / "no due date" model, shared by the cards, the strip and the pop-up
  async function buildAlerts(today) {
    const [invoices, payables, projects, tradings, hs] = await Promise.all([loadInvoices(), loadPayables(), loadProjects(), loadTradings(), holidaySet()]);
    const alerts = [];
    const noDueDate = [];
    const add = (type, key, title, subtitle, date, amountC, link, horizon = HORIZON_DAYS) => {
      const days = daysBetween(today, date);
      if (days > horizon) return;
      alerts.push({
        id: `${type}:${key}`, type, severity: days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming',
        title, subtitle: subtitle || '', date, amount: amountC === null ? null : money(amountC),
        days, daysLeft: days >= 0 ? days : 0, daysLate: days < 0 ? -days : 0, link,
      });
    };

    // RECEIVABLES. One alert per open invoice, on the date that is next to be met: the first due date while its
    // part is still unpaid (for split terms only the down payment is due then), otherwise the second.
    for (const r of invoices) {
      if (r.voidedAt) continue;
      const balC = cents(r.balance), paidC = cents(r.paidTotal), dueC = cents(r.totalAmountDue);
      if (balC <= 0) continue;
      const link = { view: 'receivables', id: r.id };
      if (!r.dueDate) { noDueDate.push({ type: 'receivable', id: `receivable:${r.id}`, title: `${r.biNumber} — ${r.billedTo}`, subtitle: 'Invoice has no due date', amount: money(balC), link }); continue; }
      const split = r.dpPercent !== null && !!r.dueDate2;
      const dpC = split ? Math.round(dueC * r.dpPercent / 100) : dueC;
      const firstOpen = !split || paidC < dpC;
      const date = firstOpen ? r.dueDate : r.dueDate2;
      const amountC = firstOpen ? (split ? dpC - paidC : balC) : balC;
      add('receivable', r.id, `${r.biNumber} — ${r.billedTo}`, split ? (firstOpen ? 'Down payment' : 'Balance') : (r.sourceName || ''), date, amountC, link);
    }

    // PAYABLES. Purchase orders with a balance and a due date derived from their terms.
    for (const p of payables) {
      if (p.unpayable) continue;
      const balC = cents(p.balance);
      if (balC <= 0) continue;
      const link = { view: 'payables', id: p.id, search: p.poNumber };
      if (!p.dueDate) { noDueDate.push({ type: 'payable', id: `payable:${p.id}`, title: `${p.poNumber} — ${p.supplier || 'Unknown supplier'}`, subtitle: p.paymentTerms ? `Terms "${p.paymentTerms}" give no due date` : 'PO has no payment terms', amount: money(balC), link: { view: 'orders', id: p.id } }); continue; }
      add('payable', p.id, `${p.poNumber} — ${p.supplier || 'Unknown supplier'}`, p.allocationName || '', p.dueDate, balC, link);
    }

    // PROJECTS. Anything not Completed with a target date inside the horizon, or past it.
    for (const pr of projects) {
      if (pr.status === 'Completed') continue;
      const link = { view: 'projects', id: pr.id };
      if (!pr.target) { noDueDate.push({ type: 'project', id: `project:${pr.id}`, title: pr.name, subtitle: `${pr.status || 'Active'} project has no target completion date`, amount: null, link }); continue; }
      add('project', pr.id, pr.name, pr.client ? `${pr.client} · target completion` : 'Target completion', pr.target, null, link);
    }

    // TRADING DEALS. Not delivered (no non-voided Delivery Receipt) and not Completed.
    for (const t of tradings) {
      if (t.delivered || t.status === 'Completed') continue;
      const link = { view: 'tradings', id: t.id };
      if (!t.expected) { noDueDate.push({ type: 'trading', id: `trading:${t.id}`, title: t.name, subtitle: 'Undelivered deal has no expected delivery date', amount: null, link }); continue; }
      add('trading', t.id, t.name, t.client ? `${t.client} · expected delivery` : 'Expected delivery', t.expected, null, link);
    }

    // PAYDAY. Within 3 days (never "overdue": a payday that has passed is simply gone).
    const ym = monthOf(today);
    for (const m of [shiftMonth(ym, -1), ym, shiftMonth(ym, 1)]) {
      for (const pd of paydaysOf(m, hs)) {
        const days = daysBetween(today, pd.date);
        if (days >= 0 && days <= PAYDAY_DAYS) add('payday', pd.date, 'Payday', pd.label, pd.date, null, { view: 'payroll' }, PAYDAY_DAYS);
      }
    }

    const sev = { overdue: 0, today: 1, upcoming: 2 };
    alerts.sort((a, b) => sev[a.severity] - sev[b.severity] || a.days - b.days || a.title.localeCompare(b.title));
    const counts = Object.fromEntries(ALERT_TYPES.map((t) => [t, { overdue: 0, today: 0, upcoming: 0, total: 0 }]));
    for (const a of alerts) { counts[a.type][a.severity]++; counts[a.type].total++; }
    const totals = { overdue: 0, today: 0, upcoming: 0, total: alerts.length };
    for (const a of alerts) totals[a.severity]++;
    return { alerts, counts, totals, noDueDate, invoices, payables, projects, tradings, hs };
  }

  // ---- CALENDAR + NEXT 14 DAYS. Every dated thing that is still open, on its own date. An item that is already
  // late keeps its ORIGINAL date (flagged overdue) rather than moving to today. Paid, completed and delivered items
  // are gone. Split-terms invoices show both of their dates while they are owed.
  function buildEvents(today, A, holidays) {
    const ev = [];
    const push = (kind, key, date, title, subtitle, amountC, link, open) => {
      const days = daysBetween(today, date);
      ev.push({ id: `${kind}:${key}:${date}`, kind, date, title, subtitle: subtitle || '', amount: amountC === null ? null : money(amountC), overdue: !!open && days < 0, days, link });
    };
    for (const r of A.invoices) {
      if (r.voidedAt) continue;
      const balC = cents(r.balance), paidC = cents(r.paidTotal), dueC = cents(r.totalAmountDue);
      if (balC <= 0 || !r.dueDate) continue;
      const link = { view: 'receivables', id: r.id };
      const split = r.dpPercent !== null && !!r.dueDate2;
      const dpC = split ? Math.round(dueC * r.dpPercent / 100) : dueC;
      const title = `${r.biNumber} — ${r.billedTo}`;
      if (!split || paidC < dpC) push('receivable', r.id, r.dueDate, title, split ? 'Down payment' : (r.sourceName || ''), split ? dpC - paidC : balC, link, true);
      if (r.dueDate2) push('receivable', r.id, r.dueDate2, title, 'Balance', balC, link, true);
    }
    for (const p of A.payables) {
      if (p.unpayable || cents(p.balance) <= 0 || !p.dueDate) continue;
      push('payable', p.id, p.dueDate, `${p.poNumber} — ${p.supplier || 'Unknown supplier'}`, p.allocationName || '', cents(p.balance), { view: 'payables', id: p.id, search: p.poNumber }, true);
    }
    for (const pr of A.projects) {
      if (pr.status === 'Completed' || !pr.target) continue;
      push('project', pr.id, pr.target, pr.name, pr.client ? `${pr.client} · target completion` : 'Target completion', null, { view: 'projects', id: pr.id }, true);
    }
    for (const t of A.tradings) {
      if (t.delivered || t.status === 'Completed' || !t.expected) continue;
      push('trading', t.id, t.expected, t.name, t.client ? `${t.client} · expected delivery` : 'Expected delivery', null, { view: 'tradings', id: t.id }, true);
    }
    return { ev, push };
  }

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  // ---- CHARTS. Every figure is built here from the same rows the reports read, so a chart total always ties to its report.
  //   cashFlow     last 6 Manila months: collections (non-voided invoice payments by date received) vs disbursements
  //                (non-voided vouchers by date, petty cash included; PCF "Add amount" is a transfer, never counted)
  //   aging        positive balances in one bucket each, by days past the next unmet due date; no due date = not yet due
  //   spendByGl    this month's EXPENSE lines of non-voided vouchers by GL account (PO payments are supplier settlements)
  const AGING = [
    { key: 'notDue', label: 'Not yet due / no due date' }, { key: 'd1_30', label: '1–30 days late' }, { key: 'd31_60', label: '31–60' },
    { key: 'd61_90', label: '61–90' }, { key: 'd90', label: '90+' },
  ];
  const bucketOf = (daysLate) => (daysLate <= 0 ? 'notDue' : daysLate <= 30 ? 'd1_30' : daysLate <= 60 ? 'd31_60' : daysLate <= 90 ? 'd61_90' : 'd90');
  function aging(items) {
    const acc = Object.fromEntries(AGING.map((b) => [b.key, { key: b.key, label: b.label, amountC: 0, count: 0 }]));
    for (const it of items) { const b = acc[bucketOf(it.daysLate)]; b.amountC += it.balC; b.count++; }
    const buckets = AGING.map((b) => ({ key: b.key, label: b.label, amount: money(acc[b.key].amountC), count: acc[b.key].count }));
    return { buckets, total: money(Object.values(acc).reduce((n, b) => n + b.amountC, 0)), count: items.length };
  }

  async function buildCharts(today, A) {
    const thisMonth = monthOf(today);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisMonth, i - 5));
    const lo = `${months[0]}-01`, hi = lastDay(thisMonth);
    const col = new Map((await query(
      `SELECT to_char(ip.paid_on, 'YYYY-MM') AS m, SUM(ip.amount) AS total, COUNT(*)::int AS n
         FROM invoice_payments ip JOIN billing_invoices bi ON bi.id = ip.billing_invoice_id
        WHERE ip.voided_at IS NULL AND ip.paid_on BETWEEN $1::date AND $2::date GROUP BY 1`, [lo, hi])).rows.map((r) => [r.m, r]));
    const dis = new Map((await query(
      `SELECT to_char(expense_date, 'YYYY-MM') AS m, SUM(amount) AS total, COUNT(*)::int AS n
         FROM expenses WHERE voided_at IS NULL AND expense_date BETWEEN $1::date AND $2::date GROUP BY 1`, [lo, hi])).rows.map((r) => [r.m, r]));
    const cashFlow = months.map((m) => {
      const c = cents(col.get(m)?.total), d = cents(dis.get(m)?.total);
      return { month: m, collected: money(c), disbursed: money(d), net: money(c - d), collectedCount: col.get(m)?.n || 0, disbursedCount: dis.get(m)?.n || 0 };
    });

    // Receivables: the next unmet due date (first date while its part is unpaid, else the second). Payables: the PO's due date.
    const recv = [];
    for (const r of A.invoices) {
      if (r.voidedAt) continue;
      const balC = cents(r.balance);
      if (balC <= 0) continue;
      let due = r.dueDate;
      if (r.dueDate && r.dpPercent !== null && r.dueDate2 && cents(r.paidTotal) >= Math.round(cents(r.totalAmountDue) * r.dpPercent / 100)) due = r.dueDate2;
      recv.push({ balC, daysLate: due ? -daysBetween(today, due) : 0 });
    }
    const pay = [];
    for (const p of A.payables) {
      const balC = cents(p.balance);
      if (p.unpayable || balC <= 0) continue;
      pay.push({ balC, daysLate: p.dueDate ? -daysBetween(today, p.dueDate) : 0 });
    }

    const first = `${thisMonth}-01`;
    const glRows = (await query(
      `SELECT COALESCE(g.id::text, 'none') AS key, COALESCE(g.name, 'No GL account') AS name, SUM(a.amount) AS total, COUNT(*)::int AS n
         FROM expense_allocations a JOIN expenses e ON e.id = a.expense_id LEFT JOIN gl_accounts g ON g.id = a.gl_account_id
        WHERE e.voided_at IS NULL AND e.expense_date BETWEEN $1::date AND $2::date
        GROUP BY 1, 2 ORDER BY SUM(a.amount) DESC, 2`, [first, hi])).rows;
    const spendByGl = { month: thisMonth, rows: glRows.map((r) => ({ key: r.key, name: r.name, amount: money(cents(r.total)), lines: r.n })),
      total: money(glRows.reduce((n, r) => n + cents(r.total), 0)) };

    return { cashFlow, aging: { receivables: aging(recv), payables: aging(pay) }, spendByGl };
  }

  app.get('/api/accounting/overview', requireRole(reportRoles), async (req, res) => {
    try {
      const today = await manilaToday();
      const A = await buildAlerts(today);
      const month = MONTH_RE.test(String(req.query.month || '')) ? String(req.query.month) : monthOf(today);
      const { ev, push } = buildEvents(today, A);
      // paydays for the shown month and the next-14-days window; holidays likewise
      const spanMonths = new Set([month, monthOf(today), monthOf(addDays(today, NEXT_DAYS - 1))]);
      for (const m of spanMonths) for (const pd of paydaysOf(m, A.hs)) push('payday', pd.date, pd.date, 'Payday', pd.label, null, { view: 'payroll' }, false);
      const lo = `${[...spanMonths].sort()[0]}-01`, hi = lastDay([...spanMonths].sort().slice(-1)[0]);
      const hol = (await query(`SELECT to_char(holiday_date,'YYYY-MM-DD') AS d, name, type FROM holidays WHERE holiday_date BETWEEN $1::date AND $2::date ORDER BY holiday_date`, [lo, hi])).rows;
      for (const h of hol) push('holiday', h.d, h.d, h.name || 'Holiday', h.type === 'regular' ? 'Regular holiday' : 'Special holiday', null, null, false);
      const byDate = (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
      const calendar = { month, events: ev.filter((e) => monthOf(e.date) === month).sort(byDate) };
      const lastDayN = addDays(today, NEXT_DAYS - 1);
      const next14 = {
        from: today, to: lastDayN,
        overdue: ev.filter((e) => e.overdue).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
        upcoming: ev.filter((e) => !e.overdue && e.date >= today && e.date <= lastDayN).sort(byDate),
      };

      // RECEIVABLES: the Receivables report -- non-voided invoices, only POSITIVE balances, the overdue part as the report flags it.
      const liveInv = A.invoices.filter((r) => !r.voidedAt);
      const recvOut = liveInv.reduce((n, r) => n + Math.max(cents(r.balance), 0), 0);
      const recvOverdue = liveInv.filter((r) => r.overdue);
      // PAYABLES: the Payable Report's summary -- positive balances; overdue = balance of overdue orders.
      const payOut = A.payables.reduce((n, x) => n + Math.max(cents(x.balance), 0), 0);
      const payOverdue = A.payables.filter((x) => x.overdue);

      // THIS MONTH (Manila): Collected = the Collections report (non-voided invoice payments by date received);
      // Disbursed = the Disbursement Report (non-voided vouchers by date, petty cash included -- PCF "Add amount"
      // entries are transfers into the fund and are not vouchers, so they never appear here).
      const first = `${monthOf(today)}-01`, last = lastDay(monthOf(today));
      const f = collectionsWhere({ from: first, to: last });
      const col = (await query(
        `SELECT COALESCE(SUM(ip.amount),0) AS total, COUNT(*)::int AS n FROM invoice_payments ip JOIN billing_invoices bi ON bi.id = ip.billing_invoice_id WHERE ${f.where}`, f.params)).rows[0];
      const dis = (await query(
        `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS n FROM expenses WHERE voided_at IS NULL AND expense_date BETWEEN $1::date AND $2::date`, [first, last])).rows[0];
      const pcf = await pcfData({});
      const charts = await buildCharts(today, A);

      res.json({
        today, month: monthOf(today),
        cards: {
          receivables: { outstanding: money(recvOut), overdue: money(recvOverdue.reduce((n, r) => n + cents(r.amountOverdue), 0)), overdueCount: recvOverdue.length, openCount: liveInv.filter((r) => cents(r.balance) > 0).length, view: 'receivables' },
          payables: { outstanding: money(payOut), overdue: money(payOverdue.reduce((n, x) => n + cents(x.balance), 0)), overdueCount: payOverdue.length, openCount: A.payables.filter((x) => cents(x.balance) > 0).length, view: 'payables' },
          collected: { amount: money(cents(col.total)), count: col.n, from: first, to: last, view: 'collections' },
          disbursed: { amount: money(cents(dis.total)), count: dis.n, from: first, to: last, view: 'expenses' },
          pcf: { configured: !!pcf.configured, balance: pcf.configured ? pcf.cards.balance : null, balanceNegative: pcf.configured ? pcf.cards.balanceNegative : false, view: 'pcf' },
        },
        alerts: A.alerts, counts: A.counts, totals: A.totals, noDueDate: A.noDueDate, calendar, next14, charts,
        horizonDays: HORIZON_DAYS, paydayDays: PAYDAY_DAYS,
      });
    } catch (err) { console.error('accounting overview error:', err); res.status(500).json({ error: err.message }); }
  });
}
