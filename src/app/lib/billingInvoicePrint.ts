// ============================================================================
// The BILLING INVOICE — the second document in the billing family, printed the same way as the
// client-facing delivery receipt (deliveryReceiptPrint.ts) and sharing its chrome: A4, Times New
// Roman, the BIR letterhead (COMPANY_BIR), the repeating header/footer groups, and the
// WORKING COPY badge.
//
// Like the DR, this is an INTERNAL working copy. The official document is the pre-printed BIR
// booklet sheet whose number is typed in by hand; this print exists so the office has a legible
// record of what was written on that sheet, and it says so under the title and in the footer.
//
// Every tax, discount and withholding figure printed here was TYPED by the accountant to mirror
// the client's purchase order. Nothing in this module computes VAT or a total: the only figure it
// derives is "Total Sales", the sum of the line amounts, and each line's amount came from
// qty x unit_price on the server. A blank total line prints blank — on a BIR form an empty VAT
// row and a "0.00" VAT row do not say the same thing.
// ============================================================================

import { renderPrintDocument, printBirHeaderHtml, printFooterHtml, COMPANY_BIR } from './printChrome';

export interface PrintableBiLine {
  description: string;
  quantity: number | string;
  unit?: string | null;
  // Snake_case because this is the stored JSONB shape, passed through untouched from the server.
  unit_price?: number | string | null;
  amount?: number | string | null;
}

export interface PrintableBi {
  biNumber: string;
  biDate?: string | null;
  saleType?: 'cash' | 'charge' | string | null;
  billedTo: string;
  billedAddress?: string | null;
  billedTin?: string | null;
  paymentTerms?: string | null;
  items: PrintableBiLine[];
  // The typed totals block. Any of them may be null/blank, and a blank one prints as a blank line.
  vatableSales?: number | string | null;
  vatExemptSales?: number | string | null;
  zeroRatedSales?: number | string | null;
  vatAmount?: number | string | null;
  lessVat?: number | string | null;
  netOfVat?: number | string | null;
  lessDiscount?: number | string | null;
  lessWithholding?: number | string | null;
  totalAmountDue?: number | string | null;
  voidedAt?: string | null;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A calendar date, formatted from its Y-M-D parts. `new Date('2026-10-13')` is UTC midnight and
// would print the 12th in Manila.
const dayFmt = (d?: string | null): string => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
};

// Money with thousands separators and exactly two decimals. No peso sign: the BIR form carries
// the currency in its own column heading, and the booklet's amount column has none.
const amt = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || String(v).trim() === '') return '';
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// The booklet's ruled lines run on whether or not the invoice fills them.
const MIN_ROWS = 10;

export function printBillingInvoice(bi: PrintableBi): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the billing invoice' };

  const lines = Array.isArray(bi.items) ? bi.items : [];
  const rows = lines.map(it => `
    <tr>
      <td class="c-desc">${esc(it.description)}</td>
      <td class="c-qty">${esc(it.quantity)}</td>
      <td class="c-unit">${esc(it.unit || '')}</td>
      <td class="c-money">${esc(amt(it.unit_price ?? null))}</td>
      <td class="c-money">${esc(amt(it.amount ?? null))}</td>
    </tr>`).join('');
  const filler = Array.from({ length: Math.max(0, MIN_ROWS - lines.length) },
    () => '<tr><td class="c-desc">&nbsp;</td><td class="c-qty">&nbsp;</td><td class="c-unit">&nbsp;</td><td class="c-money">&nbsp;</td><td class="c-money">&nbsp;</td></tr>').join('');

  // The ONE derived figure on the page: the sum of the line amounts. Everything below it is typed.
  const lineSum = lines.reduce((n, it) => {
    const v = Number(String(it.amount ?? '').replace(/,/g, ''));
    return n + (Number.isFinite(v) ? v : 0);
  }, 0);

  const isCash = String(bi.saleType || '').toLowerCase() === 'cash';
  const mark = (on: boolean) => `<span class="tick">${on ? 'X' : '&nbsp;'}</span>`;

  // label / value / emphasised. Rendered in the BIR form's order.
  const totalRows: [string, string, boolean][] = [
    ['Total Sales', amt(lineSum), false],
    ['VATable Sales', amt(bi.vatableSales ?? null), false],
    ['VAT-Exempt Sales', amt(bi.vatExemptSales ?? null), false],
    ['Zero-Rated Sales', amt(bi.zeroRatedSales ?? null), false],
    ['Less: VAT', amt(bi.lessVat ?? null), false],
    ['Net of VAT', amt(bi.netOfVat ?? null), false],
    ['Less: Discount', amt(bi.lessDiscount ?? null), false],
    ['Add: VAT', amt(bi.vatAmount ?? null), false],
    ['Less: Withholding Tax', amt(bi.lessWithholding ?? null), false],
    ['TOTAL AMOUNT DUE', amt(bi.totalAmountDue ?? null), true],
  ];

  const css = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bi-title { text-align: center; font-size: 15pt; font-weight: bold; letter-spacing: 2px; margin: 10px 0 4px; }
  /* Identical treatment to the DR's badge — this is the same family of document and must be
     recognisable as a working copy at a glance. */
  .bi-copy { text-align: center; margin: 0 0 8px; }
  .bi-copy span { display: inline-block; border: 1px solid #555; border-radius: 2px; padding: 1px 9px;
                  font-size: 8pt; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase; color: #333; }
  .bi-topline { display: flex; justify-content: space-between; align-items: flex-end; margin: 6px 0 10px; font-size: 11pt; }
  .bi-no { font-weight: bold; }
  .bi-no .num { color: #c1121f; font-size: 14pt; font-weight: bold; letter-spacing: 1px; }
  .bi-date .val { display: inline-block; min-width: 170px; border-bottom: 1px solid #000; padding: 0 4px; text-align: center; }
  /* CASH / CHARGE, boxed ticks like the booklet. */
  .bi-sale { display: flex; gap: 22px; font-size: 10.5pt; margin: 2px 0 10px; }
  .bi-sale label { font-weight: bold; }
  .tick { display: inline-block; width: 14px; height: 14px; line-height: 14px; text-align: center;
          border: 1px solid #000; font-weight: bold; margin-right: 5px; vertical-align: -2px; }
  .bi-field { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 7px; font-size: 11pt; }
  .bi-field .lbl { font-weight: bold; white-space: nowrap; }
  .bi-field .val { flex: 1; border-bottom: 1px solid #000; padding: 0 4px; min-height: 16px; }
  .bi-field.half { display: inline-flex; width: 48%; }
  .bi-row2 { display: flex; gap: 4%; }
  .bi-billed { font-weight: bold; font-size: 10pt; letter-spacing: 1px; margin: 12px 0 6px; }
  table.bi-items { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10.5pt; }
  table.bi-items th, table.bi-items td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  table.bi-items th { text-align: center; font-weight: bold; letter-spacing: 0.5px; }
  .c-qty { width: 56px; text-align: center; }
  .c-unit { width: 64px; text-align: center; }
  .c-money { width: 96px; text-align: right; }
  /* The totals column sits under the amount column, as on the form. */
  .bi-totals { width: 52%; margin-left: auto; margin-top: 10px; border-collapse: collapse; font-size: 10.5pt; }
  .bi-totals td { padding: 2px 6px; }
  .bi-totals td.k { text-align: right; }
  .bi-totals td.v { width: 120px; text-align: right; border-bottom: 1px solid #000; }
  .bi-totals tr.grand td { font-weight: bold; font-size: 11.5pt; padding-top: 6px; }
  .bi-totals tr.grand td.v { border-top: 1px solid #000; border-bottom: 3px double #000; }
  .bi-terms { margin-top: 12px; font-size: 10pt; }
  .bi-signs { display: flex; justify-content: space-between; gap: 40px; margin-top: 44px; }
  .bi-sign { flex: 1; text-align: center; }
  .bi-sign .line { border-bottom: 1px solid #000; height: 1px; }
  .bi-sign .cap { font-size: 9.5pt; margin-top: 4px; }
  .bi-fine { margin-top: 18px; text-align: center; font-size: 9pt; font-weight: bold; letter-spacing: 0.5px; }
  .bi-foot-note { margin-top: 6px; text-align: center; font-size: 7.5pt; color: #333; line-height: 1.35; }
  .bi-void { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 56pt;
             font-weight: bold; color: rgba(193,18,31,0.22); letter-spacing: 10px; transform: rotate(-18deg); }
`;

  const body = `
  ${bi.voidedAt ? '<div class="bi-void">VOID</div>' : ''}
  <div class="bi-title">BILLING INVOICE</div>
  <div class="bi-copy"><span>Working copy &mdash; not an official BIR receipt</span></div>
  <div class="bi-topline">
    <div class="bi-no">No. <span class="num">${esc(bi.biNumber)}</span></div>
    <div class="bi-date"><b>Date:</b> <span class="val">${esc(dayFmt(bi.biDate))}</span></div>
  </div>

  <div class="bi-sale">
    <label>${mark(isCash)}CASH SALE</label>
    <label>${mark(!isCash)}CHARGE SALE</label>
  </div>

  <div class="bi-billed">BILLED TO</div>
  <div class="bi-field"><span class="lbl">Registered Name:</span><span class="val">${esc(bi.billedTo)}</span></div>
  <div class="bi-row2">
    <div class="bi-field half"><span class="lbl">TIN:</span><span class="val">${esc(bi.billedTin || '')}</span></div>
    <div class="bi-field half"><span class="lbl">Terms:</span><span class="val">${esc(bi.paymentTerms || '')}</span></div>
  </div>
  <div class="bi-field"><span class="lbl">Business Address:</span><span class="val">${esc(bi.billedAddress || '')}</span></div>

  <table class="bi-items">
    <thead><tr>
      <th>DESCRIPTION</th><th class="c-qty">QTY</th><th class="c-unit">UNIT</th>
      <th class="c-money">UNIT PRICE</th><th class="c-money">AMOUNT</th>
    </tr></thead>
    <tbody>${rows}${filler}</tbody>
  </table>

  <table class="bi-totals">
    ${totalRows.map(([k, v, grand]) => `
    <tr${grand ? ' class="grand"' : ''}><td class="k">${esc(k)}</td><td class="v">${esc(v) || '&nbsp;'}</td></tr>`).join('')}
  </table>

  <div class="bi-signs">
    <div class="bi-sign"><div class="line"></div><div class="cap">Received the original invoice (Customer)</div></div>
    <div class="bi-sign"><div class="line"></div><div class="cap">Authorized Representative</div></div>
  </div>

  <div class="bi-fine">THIS DOCUMENT IS NOT VALID FOR CLAIMING INPUT TAXES</div>
  <div class="bi-foot-note">
    ${esc(COMPANY_BIR.name)} &nbsp;&middot;&nbsp; ${esc(COMPANY_BIR.tin)}<br>
    Internal working copy &mdash; the official invoice issued to the client is pre-printed BIR
    booklet sheet No. ${esc(bi.biNumber)}.
  </div>`;

  const html = renderPrintDocument({
    title: `Billing Invoice - ${bi.biNumber}`,
    // Empty for the same reason as the DR: a BIR form centres its own title and uses the BIR
    // letterhead, not the shared bordered rectangle.
    docTitle: '',
    css,
    body,
    headerHtml: printBirHeaderHtml(),
    footerHtml: printFooterHtml(),
  });

  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
