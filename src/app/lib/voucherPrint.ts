// ============================================================================
// The DISBURSEMENT VOUCHER — Kimoel's internal cash-out document.
//
// This is NOT a BIR document, so it deliberately does the opposite of the delivery receipt and the
// billing invoice: the standard Kimoel letterhead and footer that the PO and PR prints use (no logo
// block, no VAT TIN, no BIR title treatment), and no "working copy" badge — there is no official
// booklet sheet behind it for a badge to point at. The voucher number printed on it is the
// system's own EXP-YYYY-NNNN, which is the only number the paper has.
//
// It lists what the money went to, in two kinds of line: PO payments (a supplier invoice, shown with
// its PO number and supplier) and expenses (a direct cost, shown with what it was charged to). The
// total is the amount that left the company. A voided voucher prints with a VOID watermark and its
// reason, so a spoiled sheet can never pass for a live one.
//
// Nothing here adds anything up: the total and every line amount are the figures the server stored.
// ============================================================================

import { renderPrintDocument } from './printChrome';

export interface PrintableVoucherPoLine {
  poNumber: string;
  supplier?: string | null;
  amount: number | string;
}

export interface PrintableVoucherExpenseLine {
  name?: string | null;      // what it was charged to
  kind?: string | null;      // project | trading | facility
  amount: number | string;
}

export interface PrintableVoucher {
  serialNo: string | null;
  expenseDate: string;
  payee?: string | null;
  description: string;
  referenceNo?: string | null;
  paymentMode?: string | null;
  checkNo?: string | null;
  bank?: string | null;
  checkDate?: string | null;
  amount: number | string;
  createdBy?: string | null;
  poPayments: PrintableVoucherPoLine[];
  allocations: PrintableVoucherExpenseLine[];
  voidedAt?: string | null;
  voidReason?: string | null;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const peso = (n: unknown) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A calendar date from its Y-M-D parts. `new Date('2026-10-20')` is UTC midnight and would print the
// day before in Manila.
const dayFmt = (d?: string | null): string => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
};

const MODE_LABEL: Record<string, string> = { cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', petty_cash: 'Petty cash' };
const KIND_LABEL: Record<string, string> = { project: 'Project', trading: 'Trading deal', facility: 'Facility' };

export function printVoucher(v: PrintableVoucher): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the voucher' };

  const mode = v.paymentMode ? (MODE_LABEL[v.paymentMode] || v.paymentMode) : '';
  // Check details are only ever present for a check, but are printed only if they are.
  const modeLine = [
    mode,
    v.paymentMode === 'check' && v.checkNo ? `No. ${v.checkNo}` : '',
    v.paymentMode === 'check' && v.bank ? v.bank : '',
    v.paymentMode === 'check' && v.checkDate ? `dated ${dayFmt(v.checkDate)}` : '',
  ].filter(Boolean).join(' · ');

  let n = 0;
  const poRows = (v.poPayments || []).map(p => `
    <tr>
      <td class="c-no">${++n}</td>
      <td class="c-type">PO payment</td>
      <td>Payment of PO <b>${esc(p.poNumber)}</b></td>
      <td>${esc(p.supplier || '—')}</td>
      <td class="c-amt">${esc(peso(p.amount))}</td>
    </tr>`).join('');
  const exRows = (v.allocations || []).map(a => `
    <tr>
      <td class="c-no">${++n}</td>
      <td class="c-type">Expense</td>
      <td>${esc(v.description)}</td>
      <td>${esc(a.name || '—')}${a.kind ? `<div class="sub">${esc(KIND_LABEL[a.kind] || a.kind)}</div>` : ''}</td>
      <td class="c-amt">${esc(peso(a.amount))}</td>
    </tr>`).join('');

  const css = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin: 14px 0; font-size: 10.5pt; }
  .meta .l div, .meta .r div { margin-bottom: 4px; }
  .meta b { font-weight: bold; }
  .meta .r { text-align: right; }
  .vno { font-size: 13pt; font-weight: bold; letter-spacing: 1px; }
  .vdesc { margin: 4px 0 12px; font-size: 10.5pt; }
  table.lines { width: 100%; border-collapse: collapse; font-size: 10pt; }
  table.lines th, table.lines td { border: 1px solid #000; padding: 5px 7px; vertical-align: top; }
  table.lines th { background: #f0f0f0; text-align: left; }
  .c-no { width: 30px; text-align: center; }
  .c-type { width: 84px; white-space: nowrap; }
  .c-amt { width: 112px; text-align: right; white-space: nowrap; }
  .sub { font-size: 8.5pt; color: #444; }
  table.lines tr.total td { font-weight: bold; font-size: 11pt; border-top: 2px solid #000; }
  table.lines tr.total td.lbl { text-align: right; border-left: none; }
  .signs { display: flex; justify-content: space-between; gap: 36px; margin-top: 54px; }
  .sign { flex: 1; text-align: center; }
  .sign .line { border-top: 1px solid #000; padding-top: 3px; font-weight: bold; font-size: 10pt; min-height: 14px; overflow-wrap: break-word; }
  .sign .cap { font-size: 9pt; margin-top: 2px; }
  .vvoid { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 56pt; font-weight: bold;
           color: rgba(193,18,31,0.22); letter-spacing: 10px; transform: rotate(-18deg); }
  .voidnote { margin-top: 10px; font-size: 9.5pt; color: #8a1018; }
`;

  const body = `
  ${v.voidedAt ? '<div class="vvoid">VOID</div>' : ''}
  <div class="meta">
    <div class="l">
      <div><b>Voucher No.:</b> <span class="vno">${esc(v.serialNo || '—')}</span></div>
      <div><b>Paid to:</b> ${esc(v.payee || '—')}</div>
      ${modeLine ? `<div><b>Payment:</b> ${esc(modeLine)}</div>` : ''}
    </div>
    <div class="r">
      <div><b>Date:</b> ${esc(dayFmt(v.expenseDate))}</div>
      ${v.referenceNo ? `<div><b>Reference:</b> ${esc(v.referenceNo)}</div>` : ''}
    </div>
  </div>

  <div class="vdesc"><b>Particulars:</b> ${esc(v.description)}</div>

  <table class="lines">
    <thead><tr><th class="c-no">No.</th><th class="c-type">Type</th><th>Particulars</th><th>Supplier / Charged to</th><th class="c-amt">Amount</th></tr></thead>
    <tbody>
      ${poRows}${exRows}
      <tr class="total"><td colspan="4" class="lbl">TOTAL PAID</td><td class="c-amt">${esc(peso(v.amount))}</td></tr>
    </tbody>
  </table>

  ${v.voidedAt ? `<div class="voidnote"><b>VOIDED</b>${v.voidReason ? ` — ${esc(v.voidReason)}` : ''}. This voucher no longer counts as a payment or as spend.</div>` : ''}

  <div class="signs">
    <div class="sign"><div class="line">${esc(v.createdBy || '')}</div><div class="cap">Prepared by</div></div>
    <div class="sign"><div class="line"></div><div class="cap">Approved by</div></div>
    <div class="sign"><div class="line"></div><div class="cap">Received by</div></div>
  </div>`;

  // The standard Kimoel letterhead and footer: docTitle goes through the shared header, which draws
  // the company name and the bordered title exactly as the PO and PR prints do.
  const html = renderPrintDocument({
    title: `Disbursement Voucher - ${v.serialNo || ''}`.trim(),
    docTitle: 'DISBURSEMENT VOUCHER',
    css,
    body,
  });

  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
