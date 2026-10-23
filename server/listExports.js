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

function send(res, filename, sheets, rowCount) {
  const buf = buildWorkbook(sheets);
  res.json({ filename, mime: MIME, base64: buf.toString('base64'), rowCount });
}

const MODE_LABEL = { cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', petty_cash: 'Petty cash' };
const ALLOC_LABEL = { project: 'Project', trading: 'Trading', facility: 'Facility', 'trading-general': 'Trading-general', personal: 'Personal' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function registerListExports(app, d) {
  const { query, requireRole, reportRoles, biRoles, payablesRoles, BI_SELECT, mapBillingInvoice, PAYABLE_SELECT, mapPayable } = d;
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
                          'name', COALESCE(p.name, t.name, f.name, COALESCE(a.project_id, a.trading_id, a.facility_id)), 'amount', a.amount) ORDER BY a.id)
                  FROM expense_allocations a
                  LEFT JOIN projects p ON p.id = a.project_id LEFT JOIN tradings t ON t.id = a.trading_id LEFT JOIN facilities f ON f.id = a.facility_id
                 WHERE a.expense_id = e.id) AS allocations,
               (SELECT json_agg(json_build_object('po', po.po_number, 'supplier', COALESCE(s.name, po.client), 'amount', v.amount) ORDER BY v.id)
                  FROM voucher_po_payments v JOIN purchase_orders po ON po.id = v.purchase_order_id LEFT JOIN suppliers s ON s.id = po.supplier_id
                 WHERE v.expense_id = e.id) AS po_payments
          FROM expenses e WHERE e.id = ANY($1::int[])`, [ids]);
      const by = new Map(r.rows.map((x) => [String(x.id), x]));
      const rows = ids.map((i) => by.get(i)).filter(Boolean);

      const lineList = (x) => [
        ...(x.po_payments || []).map((p) => ({ label: `PO ${p.po}${p.supplier ? ` · ${p.supplier}` : ''}`, type: 'PO payment', amount: p.amount })),
        ...(x.allocations || []).map((a) => ({ label: a.name, type: a.kind, amount: a.amount })),
      ];
      let liveC = 0, liveN = 0;
      const main = rows.map((x) => {
        const voided = !!x.voided_at;
        if (!voided) { liveC += cents(x.amount); liveN++; }
        const labels = [...new Set(lineList(x).map((l) => l.label))];
        return [x.serial_no || '', x.d, x.payee || '', x.description || '', labels.join('; '),
          x.payment_mode ? (MODE_LABEL[x.payment_mode] || x.payment_mode) : '', x.check_no || '', x.bank || '', Number(x.amount).toFixed(2), voided ? 'Voided' : 'Active'];
      });
      let lineC = 0;
      const lines = [];
      for (const x of rows) {
        const voided = !!x.voided_at;
        for (const l of lineList(x)) {
          if (!voided) lineC += cents(l.amount);
          lines.push([x.serial_no || '', x.d, x.payee || '', l.label, l.type, Number(l.amount).toFixed(2), voided ? 'Voided' : 'Active']);
        }
      }
      const { from, to } = span(req, rows.map((x) => x.d));
      const subtitle = `Disbursement report · ${from} to ${to} · ${plural(rows.length, 'voucher')}`;
      send(res, `Disbursement-Report_${from}_to_${to}.xlsx`, [
        sheetOf({ name: 'Vouchers', title: 'Disbursement Report — vouchers', subtitle, user: req.user,
          heads: ['Voucher No.', 'Date', 'Payee', 'Description', 'Charged to', 'Mode', 'Check No.', 'Bank', 'Total', 'Status'],
          kinds: ['text', 'date', 'text', 'text', 'text', 'text', 'text', 'text', 'money', 'text'],
          widths: [16, 12, 28, 40, 48, 14, 14, 20, 16, 10], rows: main,
          totals: [[`TOTAL of the ${plural(liveN, 'active voucher')} shown${rows.length !== liveN ? ` (${rows.length - liveN} voided not counted)` : ''}`, '', '', '', '', '', '', '', c2(liveC), '']] }),
        sheetOf({ name: 'Lines', title: 'Disbursement Report — voucher lines', subtitle, user: req.user,
          heads: ['Voucher No.', 'Date', 'Payee', 'Charged to', 'Type', 'Amount', 'Status'],
          kinds: ['text', 'date', 'text', 'text', 'text', 'money', 'text'],
          widths: [16, 12, 28, 48, 14, 16, 10], rows: lines,
          totals: [['TOTAL of the lines of active vouchers', '', '', '', '', c2(lineC), '']] }),
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
}
