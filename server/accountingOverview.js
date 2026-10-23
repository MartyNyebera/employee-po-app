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
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export const HORIZON_DAYS = 7;
export const PAYDAY_DAYS = 3;
export const ALERT_TYPES = ['receivable', 'payable', 'project', 'trading', 'payday'];

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
    return { alerts, counts, totals, noDueDate, invoices, payables };
  }

  app.get('/api/accounting/overview', requireRole(reportRoles), async (req, res) => {
    try {
      const today = await manilaToday();
      const A = await buildAlerts(today);

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

      res.json({
        today, month: monthOf(today),
        cards: {
          receivables: { outstanding: money(recvOut), overdue: money(recvOverdue.reduce((n, r) => n + cents(r.amountOverdue), 0)), overdueCount: recvOverdue.length, openCount: liveInv.filter((r) => cents(r.balance) > 0).length, view: 'receivables' },
          payables: { outstanding: money(payOut), overdue: money(payOverdue.reduce((n, x) => n + cents(x.balance), 0)), overdueCount: payOverdue.length, openCount: A.payables.filter((x) => cents(x.balance) > 0).length, view: 'payables' },
          collected: { amount: money(cents(col.total)), count: col.n, from: first, to: last, view: 'collections' },
          disbursed: { amount: money(cents(dis.total)), count: dis.n, from: first, to: last, view: 'expenses' },
          pcf: { configured: !!pcf.configured, balance: pcf.configured ? pcf.cards.balance : null, balanceNegative: pcf.configured ? pcf.cards.balanceNegative : false, view: 'pcf' },
        },
        alerts: A.alerts, counts: A.counts, totals: A.totals, noDueDate: A.noDueDate,
        horizonDays: HORIZON_DAYS, paydayDays: PAYDAY_DAYS,
      });
    } catch (err) { console.error('accounting overview error:', err); res.status(500).json({ error: err.message }); }
  });
}
