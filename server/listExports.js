// ============================================================================
// "Export to Excel" for the Accounting portal's list screens.
//
// Every export is built here, server-side, with the same hand-rolled writer the reports use
// (server/xlsx.js -- no dependency). The screen posts the ids of the rows it is SHOWING, in the order it
// shows them, so the file holds exactly those rows: whatever filter, search box or status chip narrowed
// the screen, the export cannot disagree with it. The server then re-reads those rows from the database
// and derives every figure itself (balances, statuses, totals) -- nothing numeric is taken from the
// browser. Each route has the same role gate as the screen's own data route. Read-only: nothing is
// written to the database.
//
// Cells: money is a number with a 2-decimal format, dates are real Excel dates, the header row is
// frozen with a filter, and a total row follows where the screen has totals.
// ============================================================================
import { buildWorkbook, STYLE, dateSerial, colName } from './xlsx.js';

const T = STYLE;
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const cents = (v) => Math.round(Number(v || 0) * 100);
const c2 = (c) => (c / 100).toFixed(2);
const todayManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (v) => (YMD.test(String(v || '')) ? String(v) : null);

// Distinct, ordered, numeric ids out of the request body; null when there is nothing usable.
function bodyIds(req, { numeric = false } = {}) {
  const raw = req.body && req.body.ids;
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const v of raw.slice(0, 50000)) {
    const s = String(v);
    if (!s || seen.has(s) || (numeric && !/^\d+$/.test(s))) continue;
    seen.add(s); out.push(s);
  }
  return out;
}

// File-name date span: the screen's own from/to when it has them, otherwise the earliest and latest date
// of the exported rows, otherwise today.
function span(req, dates) {
  const f = ymd(req.body && req.body.from), t = ymd(req.body && req.body.to);
  const ds = dates.filter(Boolean).sort();
  const today = todayManila();
  return { from: f || ds[0] || today, to: t || ds[ds.length - 1] || today };
}

// One sheet: title block, header row at row 5 (frozen, filtered), data rows, then any total rows.
//   kinds: 'text' | 'money' | 'int' | 'date'      totals: an array of rows (each the width of heads), or null
function sheetOf({ name, title, subtitle, user, heads, kinds, widths, rows, totals }) {
  const num = (k, v) => ((v === '' || v == null) ? null : Number(v));
  const cell = (k, v) => (k === 'money' ? { v: num(k, v), s: T.MONEY }
    : k === 'int' ? { v: num(k, v), s: T.NUMBER }
    : k === 'date' ? { v: dateSerial(v), s: T.DATE }
    : { v: v ?? '', s: T.TEXT });
  const out = [
    [{ v: 'KIMOEL TRADING & CONSTRUCTION INCORPORATED', s: T.TITLE }],
    [{ v: title, s: T.SUBTITLE }],
    [{ v: `${subtitle} · exported ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}${user && user.name ? ` by ${user.name}` : ''}`, s: T.MUTED }],
    [],
    heads.map((h) => ({ v: h, s: T.HEADER })),
    ...rows.map((r) => r.map((v, i) => cell(kinds[i], v))),
    ...(totals || []).map((tr) => tr.map((v, i) => (i === 0 ? { v, s: T.TOTAL_LABEL }
      : (kinds[i] === 'money' || kinds[i] === 'int') && v !== '' && v != null ? { v: Number(v), s: T.MONEY_BOLD }
      : { v: '', s: T.TOTAL_LABEL }))),
  ];
  const headerRow = 5;
  return { rows: out, sheetName: name, widths, freezeRows: headerRow, autoFilter: `A${headerRow}:${colName(heads.length - 1)}${headerRow + rows.length}` };
}

// A finished multi-sheet export as the JSON the front-end download helper reads (used by routes outside this file).
//   sheets: [{ name, title, heads, kinds, widths, rows, totals }]   rowCount = the first sheet's rows
export function listWorkbookJson({ filename, subtitle, user, sheets }) {
  const buf = buildWorkbook(sheets.map((s) => sheetOf({ ...s, subtitle, user })));
  return { filename, mime: MIME, base64: buf.toString('base64'), rowCount: sheets[0].rows.length };
}

function send(res, filename, sheets, rowCount) {
  const buf = buildWorkbook(sheets);
  res.json({ filename, mime: MIME, base64: buf.toString('base64'), rowCount });
}

const MODE_LABEL = { cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', petty_cash: 'Petty cash' };
const ALLOC_LABEL = { project: 'Project', trading: 'Trading', facility: 'Facility', 'trading-general': 'Trading-general', personal: 'Personal' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function registerListExports(app, d) {
  const { query, requireRole, reportRoles, biRoles, payablesRoles, BI_SELECT, mapBillingInvoice, PAYABLE_SELECT, mapPayable, PO_ALLOC_COLS, PO_ALLOC_JOINS, mapPoAllocation } = d;
  const fail = (res, tag, err) => { console.error(`${tag} export error:`, err); res.status(500).json({ error: err.message }); };

  // ---------------------------------------------------------------- 1. Disbursement Report
  app.post('/api/reports/disbursements/export', requireRole(reportRoles), async (req, res) => {
    try {
      const ids = bodyIds(req, { numeric: true });
      if (!ids || ids.length === 0) return res.status(400).json({ error: 'There are no vouchers to export' });
      const r = await query(`
        SELECT e.id, e.serial_no, to_char(e.expense_date, 'YYYY-MM-DD') AS d, e.description, e.amount, e.payee,
               e.payment_mode, e.check_no, e.bank, e.voided_at,
               (SELECT json_agg(json_build_object(
                          'kind', CASE WHEN a.project_id IS NOT NULL THEN 'Project' WHEN a.trading_id IS NOT NULL THEN 'Trading' ELSE 'Facility' END,
                          'name', COALESCE(p.name, t.name, f.name, COALESCE(a.project_id, a.trading_id, a.facility_id)), 'gl', g.name, 'amount', a.amount) ORDER BY a.id)
                  FROM expense_allocations a
                  LEFT JOIN projects p ON p.id = a.project_id LEFT JOIN tradings t ON t.id = a.trading_id LEFT JOIN facilities f ON f.id = a.facility_id
                  LEFT JOIN gl_accounts g ON g.id = a.gl_account_id
                 WHERE a.expense_id = e.id) AS allocations,
               (SELECT json_agg(json_build_object('po', x.po_number, 'supplier', x.supplier, 'amount', x.amount,
                          'allocName', x.alloc_name, 'allocType', x.alloc_type, 'allocId', x.alloc_id) ORDER BY x.id)
                  FROM (SELECT v.id, v.amount, po.po_number, COALESCE(s.name, po.client) AS supplier, ${PO_ALLOC_COLS}
                          FROM voucher_po_payments v JOIN purchase_orders po ON po.id = v.purchase_order_id LEFT JOIN suppliers s ON s.id = po.supplier_id
                          LEFT JOIN purchase_requests pr ON pr.id = po.purchase_request_id
                          ${PO_ALLOC_JOINS}
                         WHERE v.expense_id = e.id) x) AS po_payments
          FROM expenses e WHERE e.id = ANY($1::int[])`, [ids]);
      const by = new Map(r.rows.map((x) => [String(x.id), x]));
      const rows = ids.map((i) => by.get(i)).filter(Boolean);

      const lineList = (x) => [
        ...(x.po_payments || []).map((p) => ({ label: `PO ${p.po}${p.supplier ? ` · ${p.supplier}` : ''}`, type: 'PO payment', gl: '', amount: p.amount })),
        ...(x.allocations || []).map((a) => ({ label: a.name, type: a.kind, gl: a.gl || '', amount: a.amount })),
      ];
      let liveC = 0, liveN = 0;
      const main = rows.map((x) => {
        const voided = !!x.voided_at;
        if (!voided) { liveC += cents(x.amount); liveN++; }
        // Project For: each PO line's own allocation, then each expense line's project / trading deal / facility
        // (the same list the screen collapses to "first +n more"; here it is in full). PO Ref.: the POs paid.
        const projectFor = [...new Set([
          ...(x.po_payments || []).map((p) => mapPoAllocation({ alloc_name: p.allocName, alloc_type: p.allocType, alloc_id: p.allocId }).allocationName || ''),
          ...(x.allocations || []).map((a) => a.name || ''),
        ].filter(Boolean))];
        const poRefs = [...new Set((x.po_payments || []).map((p) => p.po).filter(Boolean))];
        const mode = x.payment_mode ? `${MODE_LABEL[x.payment_mode] || x.payment_mode}${x.payment_mode === 'check' && x.check_no ? ` #${x.check_no}` : ''}` : '';
        return [x.serial_no || '', x.d, x.payee || '', projectFor.join('; '), poRefs.join('; '), x.description || '', Number(x.amount).toFixed(2), mode, voided ? 'Voided' : 'Active'];
      });
      let lineC = 0;
      const lines = [];
      for (const x of rows) {
        const voided = !!x.voided_at;
        for (const l of lineList(x)) {
          if (!voided) lineC += cents(l.amount);
          lines.push([x.serial_no || '', x.d, x.payee || '', l.label, l.type, l.gl, Number(l.amount).toFixed(2), voided ? 'Voided' : 'Active']);
        }
      }
      const { from, to } = span(req, rows.map((x) => x.d));
      const subtitle = `Disbursement report · ${from} to ${to} · ${plural(rows.length, 'voucher')}`;
      send(res, `Disbursement-Report_${from}_to_${to}.xlsx`, [
        sheetOf({ name: 'Vouchers', title: 'Disbursement Report — vouchers', subtitle, user: req.user,
          heads: ['CV No.', 'Date', 'Payee', 'Project For', 'PO Ref.', 'Description', 'Total Amount', 'Mode', 'Status'],
          kinds: ['text', 'date', 'text', 'text', 'text', 'text', 'money', 'text', 'text'],
          widths: [16, 12, 28, 48, 32, 40, 16, 16, 10], rows: main,
          totals: [[`TOTAL of the ${plural(liveN, 'active voucher')} shown${rows.length !== liveN ? ` (${rows.length - liveN} voided not counted)` : ''}`, '', '', '', '', '', c2(liveC), '', '']] }),
        sheetOf({ name: 'Lines', title: 'Disbursement Report — voucher lines', subtitle, user: req.user,
          heads: ['Voucher No.', 'Date', 'Payee', 'Charged to', 'Type', 'GL Account', 'Amount', 'Status'],
          kinds: ['text', 'date', 'text', 'text', 'text', 'text', 'money', 'text'],
          widths: [16, 12, 28, 48, 14, 26, 16, 10], rows: lines,
          totals: [['TOTAL of the lines of active vouchers', '', '', '', '', '', c2(lineC), '']] }),
      ], main.length);
    } catch (err) { fail(res, 'disbursements', err); }
  });

  // ---------------------------------------------------------------- 2. Payable Report
  app.post('/api/reports/payables/export', requireRole(payablesRoles), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || ids.length === 0) return res.status(400).json({ error: 'There are no purchase orders to export' });
      const all = (await query(`${PAYABLE_SELECT} ORDER BY COALESCE(po.doc_date, po.created_date) DESC, po.po_number DESC`)).rows
        .map(mapPayable).filter((x) => !x.unpayable || x.paymentCount > 0);
      const by = new Map(all.map((x) => [String(x.id), x]));
      const rows = ids.map((i) => by.get(i)).filter(Boolean);
      const statusText = (x) => (x.status === 'overpaid' ? 'Overpaid' : x.overdue ? 'Overdue' : x.status === 'paid' ? 'Paid' : x.status === 'partial' ? 'Partly paid' : 'Unpaid');
      let totC = 0, paidC = 0, outC = 0;
      const main = rows.map((x) => {
        totC += cents(x.poTotal); paidC += cents(x.paidTotal); outC += Math.max(cents(x.balance), 0);
        return [x.poNumber, x.supplier || '', x.allocationType && x.allocationName ? `${x.allocationName} · ${ALLOC_LABEL[x.allocationType] || x.allocationType}` : '',
          x.poDate, x.poTotal, x.paidTotal, x.balance, x.dueDate || '', statusText(x)];
      });
      const pays = rows.length ? (await query(
        `SELECT vp.purchase_order_id, vp.amount, e.serial_no, to_char(e.expense_date, 'YYYY-MM-DD') AS d
           FROM voucher_po_payments vp JOIN expenses e ON e.id = vp.expense_id
          WHERE e.voided_at IS NULL AND vp.purchase_order_id = ANY($1)
          ORDER BY e.expense_date, vp.id`, [rows.map((x) => x.id)])).rows : [];
      const payRows = []; let payC = 0;
      for (const x of rows) {
        for (const p of pays.filter((q) => String(q.purchase_order_id) === String(x.id))) {
          payC += cents(p.amount);
          payRows.push([x.poNumber, x.supplier || '', p.serial_no || '', p.d, Number(p.amount).toFixed(2)]);
        }
      }
      const { from, to } = span(req, rows.map((x) => x.poDate));
      const subtitle = `Payable report · PO dates ${from} to ${to} · ${plural(rows.length, 'purchase order')}`;
      send(res, `Payable-Report_${from}_to_${to}.xlsx`, [
        sheetOf({ name: 'Payables', title: 'Payable Report — purchase orders', subtitle, user: req.user,
          heads: ['PO No.', 'Supplier', 'Allocated to', 'PO Date', 'PO Total', 'Paid', 'Balance', 'Due Date', 'Status'],
          kinds: ['text', 'text', 'text', 'date', 'money', 'money', 'money', 'date', 'text'],
          widths: [18, 32, 36, 12, 16, 16, 16, 12, 12], rows: main,
          totals: [[`TOTAL (${plural(rows.length, 'purchase order')}) — Balance column = Outstanding, positive balances only`, '', '', '', c2(totC), c2(paidC), c2(outC), '', '']] }),
        sheetOf({ name: 'Payments', title: 'Payable Report — voucher payments (voided vouchers left out)', subtitle, user: req.user,
          heads: ['PO No.', 'Supplier', 'Voucher No.', 'Date', 'Amount'],
          kinds: ['text', 'text', 'text', 'date', 'money'], widths: [18, 32, 16, 12, 16], rows: payRows,
          totals: [[`TOTAL (${plural(payRows.length, 'payment')})`, '', '', '', c2(payC)]] }),
      ], main.length);
    } catch (err) { fail(res, 'payables', err); }
  });

  // ---------------------------------------------------------------- 3. Receivable Report
  app.post('/api/reports/receivables/export', requireRole(biRoles), async (req, res) => {
    try {
      const ids = bodyIds(req, { numeric: true });
      if (!ids || ids.length === 0) return res.status(400).json({ error: 'There are no invoices to export' });
      const bis = (await query(`${BI_SELECT} WHERE bi.id = ANY($1::int[])`, [ids])).rows.map(mapBillingInvoice);
      const by = new Map(bis.map((x) => [String(x.id), x]));
      const rows = ids.map((i) => by.get(i)).filter(Boolean);
      const today = todayManila();
      const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
      const label = { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid', overpaid: 'Overpaid', voided: 'Voided' };
      let dueC = 0, paidC = 0, outC = 0;
      const main = rows.map((x) => {
        dueC += cents(x.totalAmountDue); paidC += cents(x.paidTotal); outC += Math.max(cents(x.balance), 0);
        // The date the unpaid portion fell due: the second date once it has passed, else the first.
        const since = x.dueDate2 && x.dueDate2 <= today ? x.dueDate2 : x.dueDate;
        const days = x.overdue && since ? Math.max(dayDiff(today, since), 0) : '';
        return [x.billedTo, x.biNumber, x.sourceName || '', x.biDate, Number(x.totalAmountDue).toFixed(2), x.paidTotal, x.balance, x.dueDate || '', days, x.overdue ? 'Overdue' : (label[x.status] || x.status)];
      });
      const pays = rows.length ? (await query(
        `SELECT ip.billing_invoice_id, ip.amount, ip.or_number, ip.reference, to_char(ip.paid_on, 'YYYY-MM-DD') AS d
           FROM invoice_payments ip WHERE ip.voided_at IS NULL AND ip.billing_invoice_id = ANY($1::int[])
          ORDER BY ip.paid_on, ip.id`, [rows.map((x) => x.id)])).rows : [];
      const payRows = []; let payC = 0;
      for (const x of rows) {
        for (const p of pays.filter((q) => Number(q.billing_invoice_id) === x.id)) {
          payC += cents(p.amount);
          payRows.push([x.biNumber, x.billedTo, p.d, p.or_number || '', p.reference || '', Number(p.amount).toFixed(2)]);
        }
      }
      const { from, to } = span(req, rows.map((x) => x.biDate));
      const subtitle = `Receivable report · invoice dates ${from} to ${to} · ${plural(rows.length, 'invoice')}`;
      send(res, `Receivable-Report_${from}_to_${to}.xlsx`, [
        sheetOf({ name: 'Receivables', title: 'Receivable Report — billing invoices', subtitle, user: req.user,
          heads: ['Client', 'BI No.', 'Deal/description', 'Date', 'Total Due', 'Paid', 'Balance', 'Due Date', 'Days overdue', 'Status'],
          kinds: ['text', 'text', 'text', 'date', 'money', 'money', 'money', 'date', 'int', 'text'],
          widths: [32, 14, 32, 12, 16, 16, 16, 12, 13, 12], rows: main,
          totals: [[`TOTAL (${plural(rows.length, 'invoice')}) — Invoiced · Collected · Outstanding (positive balances only)`, '', '', '', c2(dueC), c2(paidC), c2(outC), '', '', '']] }),
        sheetOf({ name: 'Payments', title: 'Receivable Report — payments received (voided payments left out)', subtitle, user: req.user,
          heads: ['BI No.', 'Client', 'Date received', 'OR No.', 'Reference', 'Amount'],
          kinds: ['text', 'text', 'date', 'text', 'text', 'money'], widths: [14, 32, 14, 14, 24, 16], rows: payRows,
          totals: [[`TOTAL (${plural(payRows.length, 'payment')})`, '', '', '', '', c2(payC)]] }),
      ], main.length);
    } catch (err) { fail(res, 'receivables', err); }
  });
  registerScreenExports(app, d);
}

// ============================================================================
// The rest of the Accounting menu's list screens. Same contract as above: the screen posts the ids of the
// rows it shows (in its order), the server re-reads them and writes the columns the screen shows.
// ============================================================================
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const VAT_LABEL = { inclusive: 'VAT-inclusive', exclusive: 'VAT-exclusive', exempt: 'VAT-exempt / zero-rated' };
const ALLOC_TEXT = (a) => (a.allocationType && a.allocationName ? `${a.allocationName} · ${ALLOC_LABEL[a.allocationType] || a.allocationType}` : '');

// Mirrors src/app/lib/nextDept.ts (a display hint shown beside a request's status).
function nextDept(status, kind) {
  if (kind === 'pr') return ({ pending: 'Next: Accounting', reviewed: 'Next: Admin', verified: 'Next: Purchasing', ordered: 'Next: Admin' })[status] || '';
  return ({ pending: 'Next: Accounting', 'accounting-approved': 'Next: Admin', approved: 'Next: Warehouse (delivery)', rejected: 'Next: Purchasing (revise)' })[status] || '';
}

// ---- Attendance Sheet display maths, mirroring TimesheetReview.tsx (display only, no pay is computed).
const LUNCH_START = 12 * 60, LUNCH_END = 13 * 60;
const manilaMinuteOfDay = (iso) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  return (Number(parts.find((p) => p.type === 'hour')?.value) % 24) * 60 + Number(parts.find((p) => p.type === 'minute')?.value);
};
const lunchNet = (d) => {
  if (d.worked_minutes === null || d.worked_minutes === undefined) return null;
  if (!d.first_in || !d.last_out) return d.worked_minutes;
  const overlap = Math.max(0, Math.min(manilaMinuteOfDay(d.last_out), LUNCH_END) - Math.max(manilaMinuteOfDay(d.first_in), LUNCH_START));
  return Math.max(0, d.worked_minutes - overlap);
};
const breakOf = (d) => Math.max(0, Number(d.break_minutes) || 0);
const dockedOf = (d) => (d.break_excused ? 0 : breakOf(d));
const paidMin = (d) => { const ln = lunchNet(d); return ln === null ? null : Math.max(0, ln - dockedOf(d)); };
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }) : '');
const fmtBreakMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);
const FLAG_LABEL = { missing_out: 'Missing OUT', missing_in: 'Missing IN' };
const hours2 = (m) => (m === null || m === undefined ? '' : (Math.round((m / 60) * 100) / 100).toFixed(2));

export function registerScreenExports(app, d) {
  const { query, requireRole, reportRoles, drRoles, biRoles, attendanceReviewRoles, effectiveRole,
    BI_SELECT, mapBillingInvoice, PO_ALLOC_COLS, PO_ALLOC_JOINS, mapPoAllocation,
    PROJECT_SPEND_SQL, TRADING_SPEND_SQL, FACILITY_SPEND_SQL, attendanceSheetData } = d;
  const fail = (res, tag, err) => { console.error(`${tag} export error:`, err); res.status(500).json({ error: err.message }); };
  const orderBy = (ids, items, key) => { const m = new Map(items.map((x) => [String(key(x)), x])); return ids.map((i) => m.get(i)).filter(Boolean); };
  const nothing = (res, what) => res.status(400).json({ error: `There are no ${what} to export` });

  // ---------------------------------------------------------------- PR REQUEST
  app.post('/api/reports/purchase-requests/export', requireRole(['admin', 'purchasing', 'accounting']), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || !ids.length) return nothing(res, 'purchase requests');
      const r = await query(
        `SELECT pr.id, pr.pr_number, pr.status, pr.total, pr.items, pr.employee_name, pr.checked_by,
                to_char(pr.needed_by, 'YYYY-MM-DD') AS needed_by,
                to_char(pr.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS d,
                COALESCE(p.name, f.name, t.name, pr.project_label) AS project_name
           FROM purchase_requests pr
           LEFT JOIN projects p ON p.id = pr.project_id LEFT JOIN facilities f ON f.id = pr.facility_id LEFT JOIN tradings t ON t.id = pr.trading_id
          WHERE pr.id::text = ANY($1::text[])`, [ids]);
      let rows = orderBy(ids, r.rows, (x) => x.id);
      // Same rule as GET /api/purchase-requests: purchasing never sees a request still pending review.
      if (effectiveRole(req.user) === 'purchasing') rows = rows.filter((x) => x.status !== 'pending');
      const main = rows.map((x) => {
        const items = Array.isArray(x.items) ? x.items : [];
        return [x.pr_number, x.d, x.employee_name || '', x.project_name || 'Personal use', items.length, items.map((i) => i.description).join(', '),
          x.checked_by || '', x.needed_by || '', cap(x.status), nextDept(x.status, 'pr'), x.total == null ? '' : Number(x.total).toFixed(2)];
      });
      const { from, to } = span(req, rows.map((x) => x.d));
      send(res, `PR-Request_${from}_to_${to}.xlsx`, [sheetOf({
        name: 'PR Request', title: 'PR Request — purchase requests', subtitle: `PR Request · ${from} to ${to} · ${plural(rows.length, 'purchase request')}`, user: req.user,
        heads: ['PR No.', 'Date', 'Prepared by', 'Charged to', 'Items', 'Item descriptions', 'Reviewed by', 'Needed by', 'Status', 'Next step', 'Total'],
        kinds: ['text', 'date', 'text', 'text', 'int', 'text', 'text', 'date', 'text', 'text', 'money'],
        widths: [16, 12, 24, 32, 8, 60, 22, 12, 14, 24, 16], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'purchase-requests', err); }
  });

  // ---------------------------------------------------------------- PO REQUEST
  app.post('/api/reports/purchase-orders/export', requireRole(reportRoles), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || !ids.length) return nothing(res, 'purchase orders');
      const r = await query(
        `SELECT po.id, po.po_number, po.client, po.amount, po.status, po.processed_by, po.po_reviewed_by,
                to_char(po.created_date, 'YYYY-MM-DD') AS created_date, to_char(po.delivery_date, 'YYYY-MM-DD') AS delivery_date,
                pr.pr_number, ${PO_ALLOC_COLS}
           FROM purchase_orders po
           LEFT JOIN purchase_requests pr ON pr.id = po.purchase_request_id
           ${PO_ALLOC_JOINS}
          WHERE po.id::text = ANY($1::text[]) AND COALESCE(po.order_type, 'purchase') <> 'sales'`, [ids]);
      const rows = orderBy(ids, r.rows, (x) => x.id);
      const label = (s) => (s === 'pending' ? 'Needs review' : s === 'accounting-approved' ? 'Awaiting admin' : s === 'rejected' ? 'Rejected' : cap(s));
      const main = rows.map((x) => [x.po_number, x.pr_number || '', x.client || '', ALLOC_TEXT(mapPoAllocation(x)), x.processed_by || '', x.po_reviewed_by || '',
        x.created_date || '', x.delivery_date || '', label(x.status), nextDept(x.status, 'po'), Number(x.amount).toFixed(2)]);
      const { from, to } = span(req, rows.map((x) => x.created_date));
      send(res, `PO-Request_${from}_to_${to}.xlsx`, [sheetOf({
        name: 'PO Request', title: 'PO Request — purchase orders', subtitle: `PO Request · ${from} to ${to} · ${plural(rows.length, 'purchase order')}`, user: req.user,
        heads: ['PO No.', 'For PR', 'Supplier', 'Allocated to', 'Prepared by', 'Reviewed by', 'PO Date', 'Delivery Date', 'Status', 'Next step', 'Amount'],
        kinds: ['text', 'text', 'text', 'text', 'text', 'text', 'date', 'date', 'text', 'text', 'money'],
        widths: [18, 16, 32, 36, 22, 22, 12, 13, 16, 26, 16], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'purchase-orders', err); }
  });

  // ---------------------------------------------------------------- CONTRACT SERVICES (projects)
  app.post('/api/reports/projects/export', requireRole(reportRoles), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || !ids.length) return nothing(res, 'projects');
      const spend = (await query(PROJECT_SPEND_SQL)).rows;
      const meta = new Map((await query(`SELECT id, location, to_char(start_date, 'YYYY-MM-DD') AS s, to_char(end_date, 'YYYY-MM-DD') AS e FROM projects WHERE id::text = ANY($1::text[])`, [ids])).rows.map((x) => [String(x.id), x]));
      const rows = orderBy(ids, spend, (x) => x.id);
      const main = rows.map((x) => { const m = meta.get(String(x.id)) || {}; return [x.name, m.location || '', x.status || 'Active', m.s || '', m.e || '',
        Number(x.budget).toFixed(2), Number(x.spent).toFixed(2), Number(x.spent_prs).toFixed(2), Number(x.spent_expenses).toFixed(2), Number(x.remaining).toFixed(2), Number(x.over_budget).toFixed(2)]; });
      const today = todayManila();
      send(res, `Contract-Services_${today}_to_${today}.xlsx`, [sheetOf({
        name: 'Contract Services', title: 'Contract Services — projects', subtitle: `Contract Services · as of ${today} · ${plural(rows.length, 'project')}`, user: req.user,
        heads: ['Project', 'Location', 'Status', 'Start', 'End', 'Budget', 'Spent', 'Spent on PRs', 'Spent on expenses', 'Remaining', 'Over budget'],
        kinds: ['text', 'text', 'text', 'date', 'date', 'money', 'money', 'money', 'money', 'money', 'money'],
        widths: [40, 26, 12, 12, 12, 16, 16, 16, 18, 16, 16], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'projects', err); }
  });

  // ---------------------------------------------------------------- CONTRACT TRADING (trading deals)
  app.post('/api/reports/tradings/export', requireRole(reportRoles), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || !ids.length) return nothing(res, 'trading deals');
      const rows = orderBy(ids, (await query(TRADING_SPEND_SQL)).rows, (x) => x.id);
      const main = rows.map((x) => [x.name, x.client || '', x.status || 'Active', Number(x.spent).toFixed(2), Number(x.spent_prs).toFixed(2), Number(x.spent_expenses).toFixed(2),
        x.selling_price == null ? '' : Number(x.selling_price).toFixed(2), x.selling_price == null ? '' : (VAT_LABEL[x.selling_price_vat || 'inclusive'] || x.selling_price_vat),
        x.margin == null ? '' : Number(x.margin).toFixed(2), x.margin_percent == null ? '' : Number(x.margin_percent).toFixed(2)]);
      const today = todayManila();
      send(res, `Contract-Trading_${today}_to_${today}.xlsx`, [sheetOf({
        name: 'Contract Trading', title: 'Contract Trading — trading deals', subtitle: `Contract Trading · as of ${today} · ${plural(rows.length, 'deal')} · cost as recorded, profit on the mixed basis shown on screen`, user: req.user,
        heads: ['Trading', 'Client', 'Status', 'Cost (as recorded)', 'Cost: PRs', 'Cost: expenses', 'Selling price', 'Selling price basis', 'Profit (mixed basis)', 'Margin %'],
        kinds: ['text', 'text', 'text', 'money', 'money', 'money', 'money', 'text', 'money', 'money'],
        widths: [40, 28, 12, 18, 16, 16, 16, 24, 18, 12], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'tradings', err); }
  });

  // ---------------------------------------------------------------- FACILITIES
  app.post('/api/reports/facilities/export', requireRole(reportRoles), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || !ids.length) return nothing(res, 'facilities');
      const spend = (await query(FACILITY_SPEND_SQL)).rows;
      const desc = new Map((await query(`SELECT id, description FROM facilities WHERE id::text = ANY($1::text[])`, [ids])).rows.map((x) => [String(x.id), x.description]));
      const rows = orderBy(ids, spend, (x) => x.id);
      const main = rows.map((x) => [x.name, desc.get(String(x.id)) || '', Number(x.spent).toFixed(2), Number(x.spent_prs).toFixed(2), Number(x.spent_expenses).toFixed(2)]);
      const today = todayManila();
      send(res, `Facilities_${today}_to_${today}.xlsx`, [sheetOf({
        name: 'Facilities', title: 'Facilities', subtitle: `Facilities · as of ${today} · ${rows.length} ${rows.length === 1 ? 'facility' : 'facilities'}`, user: req.user,
        heads: ['Facility', 'Description', 'Spent', 'Spent on PRs', 'Spent on expenses'],
        kinds: ['text', 'text', 'money', 'money', 'money'], widths: [36, 56, 16, 16, 18], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'facilities', err); }
  });

  // ---------------------------------------------------------------- DELIVERY RECEIPT
  app.post('/api/reports/delivery-receipts/export', requireRole(drRoles), async (req, res) => {
    try {
      const ids = bodyIds(req, { numeric: true });
      if (!ids || !ids.length) return nothing(res, 'delivery receipts');
      const r = await query(
        `SELECT dr.id, dr.serial_no, dr.dr_number, to_char(dr.dr_date, 'YYYY-MM-DD') AS d, dr.delivered_to, dr.delivered_tin, dr.trading_id, dr.items, dr.voided_at,
                COALESCE(t.name, p.name) AS source_name
           FROM delivery_receipts dr LEFT JOIN tradings t ON t.id = dr.trading_id LEFT JOIN projects p ON p.id = dr.project_id
          WHERE dr.id = ANY($1::bigint[])`, [ids]);
      const rows = orderBy(ids, r.rows, (x) => x.id);
      const main = rows.map((x) => [x.dr_number, x.serial_no || '', x.d, x.delivered_to || '', x.delivered_tin || '', x.trading_id ? 'Trading' : 'Project', x.source_name || '',
        (Array.isArray(x.items) ? x.items : []).length, x.voided_at ? 'Voided' : 'Issued']);
      const { from, to } = span(req, rows.map((x) => x.d));
      send(res, `Delivery-Receipts_${from}_to_${to}.xlsx`, [sheetOf({
        name: 'Delivery Receipts', title: 'Delivery Receipts', subtitle: `Delivery Receipts · ${from} to ${to} · ${plural(rows.length, 'receipt')}`, user: req.user,
        heads: ['DR No.', 'Serial', 'Date', 'Delivered to', 'TIN', 'For', 'Deal / project', 'Items', 'Status'],
        kinds: ['text', 'text', 'date', 'text', 'text', 'text', 'text', 'int', 'text'],
        widths: [14, 16, 12, 36, 18, 10, 36, 8, 10], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'delivery-receipts', err); }
  });

  // ---------------------------------------------------------------- CUSTOMER'S BILLING
  app.post('/api/reports/billing-invoices/export', requireRole(biRoles), async (req, res) => {
    try {
      const ids = bodyIds(req, { numeric: true });
      if (!ids || !ids.length) return nothing(res, 'billing invoices');
      const bis = (await query(`${BI_SELECT} WHERE bi.id = ANY($1::int[])`, [ids])).rows.map(mapBillingInvoice);
      const rows = orderBy(ids, bis, (x) => x.id);
      const label = { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid', overpaid: 'Overpaid', voided: 'Voided' };
      const main = rows.map((x) => [x.biNumber, x.serialNo || '', x.biDate, x.billedTo || '', x.billedTin || '', x.drNumber || '', x.sourceName || '', cap(x.saleType),
        Number(x.totalAmountDue).toFixed(2), x.voidedAt ? 'Voided' : (label[x.status] || x.status)]);
      const { from, to } = span(req, rows.map((x) => x.biDate));
      send(res, `Billing-Invoices_${from}_to_${to}.xlsx`, [sheetOf({
        name: 'Billing Invoices', title: "Customer's Billing — billing invoices", subtitle: `Billing invoices · ${from} to ${to} · ${plural(rows.length, 'invoice')} (voided ones included, as on screen)`, user: req.user,
        heads: ['BI No.', 'Serial', 'Date', 'Billed to', 'TIN', 'From DR', 'Deal / project', 'Sale', 'Total due', 'Status'],
        kinds: ['text', 'text', 'date', 'text', 'text', 'text', 'text', 'text', 'money', 'text'],
        widths: [14, 16, 12, 36, 18, 14, 36, 12, 16, 12], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'billing-invoices', err); }
  });

  // ---------------------------------------------------------------- CLIENTS
  app.post('/api/reports/clients/export', requireRole(['owner', 'admin', 'sales', 'accounting']), async (req, res) => {
    try {
      const ids = bodyIds(req);
      if (!ids || !ids.length) return nothing(res, 'clients');
      const r = await query(`SELECT id, name, type, contact_person, phone, tin, what_they_buy, source, status FROM customers WHERE id::text = ANY($1::text[])`, [ids]);
      const rows = orderBy(ids, r.rows, (x) => x.id);
      const main = rows.map((x) => [x.name, x.type || '', x.contact_person || '', x.phone || '', x.tin || '', x.what_they_buy || '', x.source || '', x.status || '']);
      const today = todayManila();
      send(res, `Clients_${today}_to_${today}.xlsx`, [sheetOf({
        name: 'Clients', title: 'Clients', subtitle: `Clients · as of ${today} · ${plural(rows.length, 'client')}`, user: req.user,
        heads: ['Name', 'Type', 'Contact', 'Phone', 'TIN', 'Buys', 'Source', 'Status'],
        kinds: ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
        widths: [36, 14, 26, 18, 20, 40, 18, 10], rows: main, totals: null })], main.length);
    } catch (err) { fail(res, 'clients', err); }
  });

  // ---------------------------------------------------------------- ATTENDANCE SHEET
  app.post('/api/reports/attendance-sheet/export', requireRole(attendanceReviewRoles), async (req, res) => {
    try {
      const ids = bodyIds(req, { numeric: true });
      const periodId = String((req.body && req.body.periodId) ?? '');
      if (!/^\d+$/.test(periodId)) return res.status(400).json({ error: 'Pick a pay period first' });
      if (!ids || !ids.length) return nothing(res, 'attendance days');
      const sheet = await attendanceSheetData(periodId);
      if (!sheet) return res.status(404).json({ error: 'Pay period not found' });
      const days = orderBy(ids, sheet.rows, (x) => x.id);
      const yn = (b) => (b ? 'Yes' : 'No');
      const statusText = (x) => [({ complete: 'Complete', no_out: 'No OUT', incomplete: 'Incomplete' })[x.status] || x.status || '—',
        x.is_wfh ? 'WFH' : null, ...(x.flags || []).map((f) => FLAG_LABEL[f] || f), x.is_adjusted ? 'edited' : null, (x.manual_punch_count || 0) > 0 ? 'manual punch' : null].filter(Boolean).join(' · ');
      const main = days.map((x) => {
        const brk = breakOf(x), brks = x.breaks || [];
        const hasBreak = brks.length > 0 || brk > 0;
        const breakLabel = brks.length === 1 ? `${brks[0].out}–${brks[0].ret}` : brks.length > 1 ? `${brks.length} breaks` : 'manual';
        const breakText = hasBreak ? `${breakLabel} · ${brk > 0 ? fmtBreakMin(brk) : 'free'}${x.break_excused && brk > 0 ? ' (excused)' : ''}` : '';
        return [x.full_name, x.department || '', x.position || '', x.work_date, fmtTime(x.first_in), fmtTime(x.last_out), breakText, hours2(paidMin(x)), statusText(x),
          yn(x.early_ot_approved), yn(x.ot_approved), yn(x.late_excused), (!(brk > 0) && !x.break_excused) ? '' : yn(x.break_excused)];
      });
      // Per-person block, as in each person's header row on screen.
      const byPerson = new Map();
      for (const x of days) {
        if (!byPerson.has(x.person_id)) byPerson.set(x.person_id, { p: x, n: 0, min: 0, dock: 0 });
        const g = byPerson.get(x.person_id); g.n++; g.min += paidMin(x) || 0; if (lunchNet(x) !== null) g.dock += dockedOf(x);
      }
      const cls = new Map((sheet.classification || []).map((c) => [c.person_id, c]));
      const bale = new Map((sheet.bale || []).map((b) => [b.person_id, b]));
      const people = [...byPerson.values()].map((g) => {
        const c = cls.get(g.p.person_id); const b = bale.get(g.p.person_id);
        const has = c && (c.present || c.half || c.absent);
        return [g.p.full_name, g.p.department || '', g.p.position || '', g.n, hours2(g.min), hours2(g.dock), has ? c.present + 0.5 * c.half : '', has ? c.present : '', has ? c.half : '', has ? c.absent : '',
          b && b.amount != null && b.amount !== '' ? Number(b.amount).toFixed(2) : ''];
      });
      const p = sheet.period;
      const subtitle = `Attendance Sheet · pay period ${p.start_date} to ${p.end_date} (${p.status}) · ${plural(days.length, 'day')} shown · hours are paid hours, net of lunch and the docked break, as on screen`;
      send(res, `Attendance-Sheet_${p.start_date}_to_${p.end_date}.xlsx`, [
        sheetOf({ name: 'Attendance', title: 'Attendance Sheet — daily', subtitle, user: req.user,
          heads: ['Employee', 'Department', 'Position', 'Date', 'In', 'Out', 'Break', 'Hours', 'Status', 'Early OT', 'Late OT', 'Excuse Late', 'Excuse Break'],
          kinds: ['text', 'text', 'text', 'date', 'text', 'text', 'text', 'money', 'text', 'text', 'text', 'text', 'text'],
          widths: [28, 18, 22, 12, 11, 11, 24, 9, 30, 10, 10, 12, 13], rows: main, totals: null }),
        sheetOf({ name: 'By person', title: 'Attendance Sheet — per person', subtitle, user: req.user,
          heads: ['Employee', 'Department', 'Position', 'Punched days', 'Total hours', 'Break docked (hours)', 'Payroll days', 'Present', 'Half', 'Absent', 'BALE'],
          kinds: ['text', 'text', 'text', 'int', 'money', 'money', 'money', 'int', 'int', 'int', 'money'],
          widths: [28, 18, 22, 13, 12, 20, 13, 9, 7, 8, 14], rows: people, totals: null }),
      ], main.length);
    } catch (err) { fail(res, 'attendance-sheet', err); }
  });
}
