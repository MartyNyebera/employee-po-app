// ============================================================================
// The delivery receipt — printed from the logistics portal (/logistics).
// Same house style as the order documents (lib/orderPrint.ts): A4, Times New Roman,
// escaped interpolation, write → close → focus → print. The letterhead/footer/title and the
// per-page repeat come from the shared print chrome (printChrome.ts); this module only owns
// the content styles (meta rows, boxes, item table, signature).
// ============================================================================

import { renderPrintDocument, printBirHeaderHtml, printFooterHtml, COMPANY_BIR } from './printChrome';

export interface PrintableDelivery {
  deliveryNumber: string;
  status: string;
  soNumber?: string | null;
  client?: string | null;
  customerAddress?: string | null;
  customerContact?: string | null;
  amount?: number | null;
  dispatchedBy?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  receivedBy?: string | null;
  notes?: string | null;
}

const peso = (n: number) =>
  `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function printDeliveryReceipt(d: PrintableDelivery): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the delivery receipt' };

  const css = `
  .meta { display: flex; flex-wrap: wrap; gap: 6px 32px; margin: 14px 0; font-size: 10pt; }
  .meta div span { font-weight: bold; }
  .box { border: 1px solid #000; padding: 10px; margin-top: 10px; font-size: 10pt; }
  .box-title { font-weight: bold; font-size: 9pt; margin-bottom: 5px; }
  .total { text-align: right; font-weight: bold; margin-top: 8px; font-size: 11pt; }
  .cert { margin: 22px 0 10px; font-size: 10.5pt; line-height: 1.5; }
  .sign-wrap { margin-top: 40px; width: 280px; }
  .sign-line { border-bottom: 1px solid #000; }
  .sign-name { font-weight: bold; margin-top: 3px; }
  .sign-role { font-size: 9pt; }
`;

  const body = `
  <div class="meta">
    <div><span>DR No.:</span> ${esc(d.deliveryNumber)}</div>
    <div><span>Sales Order:</span> ${esc(d.soNumber || '—')}</div>
    <div><span>Dispatched by:</span> ${esc(d.dispatchedBy || '—')}</div>
    <div><span>Dispatched:</span> ${esc(fmt(d.dispatchedAt))}</div>
    <div><span>Delivered:</span> ${esc(fmt(d.deliveredAt))}</div>
  </div>

  <div class="box">
    <div class="box-title">DELIVER TO</div>
    ${esc(d.client || '—')}<br>
    ${esc(d.customerAddress || '—')}<br>
    ${esc(d.customerContact || '')}
  </div>

  ${d.amount !== null && d.amount !== undefined ? `<div class="total">Order value: ${peso(d.amount)}</div>` : ''}
  ${d.notes ? `<div class="cert"><span style="font-weight:bold">Notes:</span> ${esc(d.notes)}</div>` : ''}

  <div class="cert">
    ${d.status === 'delivered'
      ? `This certifies that the goods for the sales order above were <b>received in good order and condition</b> on ${esc(fmt(d.deliveredAt))}.`
      : `This delivery has been <b>dispatched</b> and is awaiting receipt. The recipient's signature below confirms delivery.`}
  </div>

  <div class="sign-wrap">
    <div class="sign-line"></div>
    <div class="sign-name">${esc(d.receivedBy || '')}</div>
    <div class="sign-role">Received By (signature over printed name)</div>
  </div>`;

  const html = renderPrintDocument({
    title: `Delivery Receipt - ${d.deliveryNumber}`,
    docTitle: 'DELIVERY RECEIPT',
    css,
    body,
  });

  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}

// ============================================================================
// The CLIENT-FACING BIR DELIVERY RECEIPT.
//
// This is the document handed over with the goods, printed to match the pre-printed BIR booklet:
// logo + registered name + VAT TIN letterhead, the DELIVERED TO / Address / TIN / Terms /
// C.R. No. / Ref. Sales Invoice No. block, a QTY · UNIT · DESCRIPTION table, the acknowledgement
// line, two signature lines, and the statutory "not valid for claiming input taxes" notice.
//
// Deliberately carries NO prices. A delivery receipt proves goods moved; what they cost is the
// invoice's business, and printing it here would hand the client our margin.
//
// The DR number prints in RED like the booklet. `-webkit-print-color-adjust: exact` is set so the
// browser does not helpfully convert it to black when printing.
// ============================================================================

export interface PrintableDrLine {
  quantity: number | string;
  unit?: string | null;
  description: string;
}

export interface PrintableBirDr {
  drNumber: string;
  drDate?: string | null;
  deliveredTo: string;
  deliveredAddress?: string | null;
  deliveredTin?: string | null;
  terms?: string | null;
  crNo?: string | null;
  refSalesInvoiceNo?: string | null;
  items: PrintableDrLine[];
  // Stamped across the page when set, so a voided sheet can never be mistaken for a live one.
  voidedAt?: string | null;
}

// A date on this document is a calendar date, not a moment. Formatted from the Y-M-D parts
// directly rather than through `new Date(...)`, which would shift a bare 'YYYY-MM-DD' by the
// UTC offset and print the day before.
const dayFmt = (d?: string | null): string => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
};

// The booklet has a fixed number of ruled lines whether or not the delivery fills them, so the
// table is padded to a minimum. Without this a one-line DR prints a table 12mm tall and the
// signatures ride up the page, which looks nothing like the pad.
const MIN_ROWS = 12;

export function printBirDeliveryReceipt(dr: PrintableBirDr): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the delivery receipt' };

  const lines = Array.isArray(dr.items) ? dr.items : [];
  const rows = lines.map(it => `
    <tr>
      <td class="c-qty">${esc(it.quantity)}</td>
      <td class="c-unit">${esc(it.unit || '')}</td>
      <td class="c-desc">${esc(it.description)}</td>
    </tr>`).join('');
  // Blank ruled rows to fill the pad.
  const filler = Array.from({ length: Math.max(0, MIN_ROWS - lines.length) },
    () => '<tr><td class="c-qty">&nbsp;</td><td class="c-unit">&nbsp;</td><td class="c-desc">&nbsp;</td></tr>').join('');

  const css = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .dr-title { text-align: center; font-size: 15pt; font-weight: bold; letter-spacing: 2px; margin: 10px 0 4px; }
  /* No. and Date sit on one line under the title, as on the booklet. */
  .dr-topline { display: flex; justify-content: space-between; align-items: flex-end; margin: 6px 0 10px; font-size: 11pt; }
  .dr-no { font-weight: bold; }
  .dr-no .num { color: #c1121f; font-size: 14pt; font-weight: bold; letter-spacing: 1px; }
  .dr-date .val { display: inline-block; min-width: 170px; border-bottom: 1px solid #000; padding: 0 4px; text-align: center; }
  /* The delivered-to block: label, then a ruled line carrying the value. */
  .dr-field { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 7px; font-size: 11pt; }
  .dr-field .lbl { font-weight: bold; white-space: nowrap; }
  .dr-field .val { flex: 1; border-bottom: 1px solid #000; padding: 0 4px; min-height: 16px; }
  .dr-field.half { display: inline-flex; width: 48%; }
  .dr-row2 { display: flex; gap: 4%; }
  table.dr-items { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11pt; }
  table.dr-items th, table.dr-items td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  table.dr-items th { text-align: center; font-weight: bold; letter-spacing: 1px; }
  .c-qty { width: 62px; text-align: center; }
  .c-unit { width: 78px; text-align: center; }
  .dr-ack { margin: 16px 0 0; font-size: 10.5pt; }
  .dr-signs { display: flex; justify-content: space-between; gap: 40px; margin-top: 46px; }
  .dr-sign { flex: 1; text-align: center; }
  .dr-sign .line { border-bottom: 1px solid #000; height: 1px; }
  .dr-sign .cap { font-size: 9.5pt; margin-top: 4px; }
  .dr-fine { margin-top: 18px; text-align: center; font-size: 9pt; font-weight: bold; letter-spacing: 0.5px; }
  /* This print is the system's INTERNAL working copy; the official client copy is the
     pre-printed BIR booklet sheet. The label must be impossible to miss yet not shout over
     the document, so: small boxed caps directly under the title, restated in the footer. */
  .dr-copy { text-align: center; margin: 0 0 8px; }
  .dr-copy span { display: inline-block; border: 1px solid #555; border-radius: 2px; padding: 1px 9px;
                  font-size: 8pt; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase; color: #333; }
  .dr-foot-note { margin-top: 6px; text-align: center; font-size: 7.5pt; color: #333; line-height: 1.35; }
  /* A voided DR must be unusable as paperwork the moment it is looked at. */
  .dr-void { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 56pt;
             font-weight: bold; color: rgba(193,18,31,0.22); letter-spacing: 10px; transform: rotate(-18deg); }
`;

  const body = `
  ${dr.voidedAt ? '<div class="dr-void">VOID</div>' : ''}
  <div class="dr-title">DELIVERY RECEIPT</div>
  <div class="dr-copy"><span>Working copy &mdash; not an official BIR receipt</span></div>
  <div class="dr-topline">
    <div class="dr-no">No. <span class="num">${esc(dr.drNumber)}</span></div>
    <div class="dr-date"><b>Date:</b> <span class="val">${esc(dayFmt(dr.drDate))}</span></div>
  </div>

  <div class="dr-field"><span class="lbl">DELIVERED TO:</span><span class="val">${esc(dr.deliveredTo)}</span></div>
  <div class="dr-field"><span class="lbl">Address:</span><span class="val">${esc(dr.deliveredAddress || '')}</span></div>
  <div class="dr-row2">
    <div class="dr-field half"><span class="lbl">TIN:</span><span class="val">${esc(dr.deliveredTin || '')}</span></div>
    <div class="dr-field half"><span class="lbl">Terms:</span><span class="val">${esc(dr.terms || '')}</span></div>
  </div>
  <div class="dr-row2">
    <div class="dr-field half"><span class="lbl">C.R. No.:</span><span class="val">${esc(dr.crNo || '')}</span></div>
    <div class="dr-field half"><span class="lbl">Ref. Sales Invoice No.:</span><span class="val">${esc(dr.refSalesInvoiceNo || '')}</span></div>
  </div>

  <table class="dr-items">
    <thead><tr><th class="c-qty">QTY</th><th class="c-unit">UNIT</th><th>DESCRIPTION</th></tr></thead>
    <tbody>${rows}${filler}</tbody>
  </table>

  <div class="dr-ack">Received the above goods in good order and condition.</div>

  <div class="dr-signs">
    <div class="dr-sign"><div class="line"></div><div class="cap">Customer&#39;s Signature</div></div>
    <div class="dr-sign"><div class="line"></div><div class="cap">Cashier / Authorized Representative</div></div>
  </div>

  <div class="dr-fine">THIS DOCUMENT IS NOT VALID FOR CLAIMING INPUT TAXES</div>
  <div class="dr-foot-note">
    ${esc(COMPANY_BIR.name)} &nbsp;·&nbsp; ${esc(COMPANY_BIR.tin)}<br>
    Internal working copy &mdash; the official receipt issued to the client is pre-printed BIR
    booklet sheet No. ${esc(dr.drNumber)}.
  </div>`;

  const html = renderPrintDocument({
    title: `Delivery Receipt - ${dr.drNumber}`,
    // Empty: a BIR document centres its own title in the body rather than using the shared
    // bordered rectangle, and the letterhead is overridden below.
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

// ============================================================================
// The INBOUND delivery receipt. The one above says goods left for a customer; this says goods
// arrived from a supplier against a purchase order, and lists what went onto the shelf as a
// result. Same paper, same title, opposite direction — the "RECEIVED FROM" box and the PO
// number are what tell them apart on the page.
// ============================================================================

// Section E — #14: a received line records what was ordered, what actually arrived, its remarks
// disposition (Approve / Incomplete / Cancelled), how many units were added to stock, and the
// resulting stock. ordered/received/remarks are optional so legacy receipts (which only stored
// added/newQuantity, or an older defective field) still print.
export interface ReceivedLine {
  itemName: string;
  added: number;
  newQuantity?: number;
  ordered?: number;
  received?: number;
  remarks?: string;
  defective?: number;
}

export interface PrintableReceipt {
  poNumber: string;
  supplier?: string | null;
  supplierAddress?: string | null;
  supplierContact?: string | null;
  prNumber?: string | null;
  amount?: number | null;
  receivedBy?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  // What this receipt put into inventory. THREE distinct states, and the document says which:
  //   [...]      — these items were added
  //   []         — recorded, and nothing was an inventory item (a hand-raised order)
  //   null/undef — the receipt predates the record; what moved was never captured. NOT the
  //                same as "nothing was added", and must not print as such.
  items?: ReceivedLine[] | null;
}

export function printReceivingReport(r: PrintableReceipt): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the receiving report' };

  const recorded = Array.isArray(r.items);
  // Section E — #14: show the full Ordered / Received / Missing / Remarks / Added breakdown when
  // the receipt recorded it. Older receipts stored only `added`, so fall back to a two-column view.
  const detailed = (r.items || []).some(it => it.ordered !== undefined || it.remarks !== undefined || it.defective !== undefined);
  // Any line short of what was ordered (received < ordered) so the receipt can flag it. No
  // re-order is raised — this is a record, not an action.
  const short = (it: ReceivedLine) =>
    (it.ordered !== undefined && Number(it.received ?? it.ordered) < it.ordered);
  const rows = (r.items || []).map((it, i) => detailed ? `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.itemName)}${short(it) ? ` <span style="color:#b45309;font-weight:bold">(short ${esc(Number(it.ordered) - Number(it.received ?? it.ordered))})</span>` : ''}</td>
      <td style="text-align:center">${it.ordered === undefined ? '' : esc(it.ordered)}</td>
      <td style="text-align:center">${it.received === undefined ? esc(it.added) : esc(it.received)}</td>
      <td style="text-align:center">${it.ordered === undefined ? '' : esc(Math.max(0, Number(it.ordered) - Number(it.received ?? it.ordered)))}</td>
      <td style="text-align:center">${esc(it.remarks ?? '')}</td>
      <td style="text-align:center">${esc(it.added)}</td>
      <td style="text-align:center">${it.newQuantity === undefined ? '' : esc(it.newQuantity)}</td>
    </tr>` : `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.itemName)}</td>
      <td style="text-align:center">${esc(it.added)}</td>
      <td style="text-align:center">${it.newQuantity === undefined ? '' : esc(it.newQuantity)}</td>
    </tr>`).join('');

  const css = `
  .meta { display: flex; flex-wrap: wrap; gap: 6px 32px; margin: 14px 0; font-size: 10pt; }
  .meta div span { font-weight: bold; }
  .box { border: 1px solid #000; padding: 10px; margin-top: 10px; font-size: 10pt; }
  .box-title { font-weight: bold; font-size: 9pt; margin-bottom: 5px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt; }
  table.items th, table.items td { border: 1px solid #000; padding: 5px 6px; }
  table.items th { background: #f0f0f0; }
  .total { text-align: right; font-weight: bold; margin-top: 8px; font-size: 11pt; }
  .cert { margin: 22px 0 10px; font-size: 10.5pt; line-height: 1.5; }
  .sign-wrap { margin-top: 40px; width: 280px; }
  .sign-line { border-bottom: 1px solid #000; }
  .sign-name { font-weight: bold; margin-top: 3px; }
  .sign-role { font-size: 9pt; }
`;

  const body = `
  <div class="meta">
    <div><span>PO No.:</span> ${esc(r.poNumber)}</div>
    ${r.prNumber ? `<div><span>For request:</span> ${esc(r.prNumber)}</div>` : ''}
    <div><span>Received:</span> ${esc(fmt(r.receivedAt))}</div>
  </div>

  <div class="box">
    <div class="box-title">RECEIVED FROM</div>
    ${esc(r.supplier || '—')}<br>
    ${esc(r.supplierAddress || '—')}<br>
    ${esc(r.supplierContact || '')}
  </div>

  ${rows ? `
  <table class="items">
    <thead><tr>${detailed
      ? '<th style="width:34px">No</th><th>Item</th><th style="width:60px">Ordered</th><th style="width:60px">Received</th><th style="width:56px">Missing</th><th style="width:88px">Remarks</th><th style="width:52px">Added</th><th style="width:68px">New stock</th>'
      : '<th style="width:40px">No</th><th>Item added to inventory</th><th style="width:90px">Received</th><th style="width:110px">New stock</th>'}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`
  : recorded
    ? `<div class="cert">This order carries no inventory items — nothing was added to stock.</div>`
    // Saying "nothing was added" here would be false: these are receipts taken before the
    // itemised list was kept, and they did move stock. Say what is actually known.
    : `<div class="cert">The itemised list was not recorded for this receipt. Stock levels reflect it; the individual lines were not captured at the time.</div>`}

  ${r.amount !== null && r.amount !== undefined ? `<div class="total">Order value: ${peso(r.amount)}</div>` : ''}
  ${r.notes ? `<div class="cert"><span style="font-weight:bold">Notes:</span> ${esc(r.notes)}</div>` : ''}

  <div class="cert">
    This certifies that the goods${rows ? ' above' : ''} for the purchase order above were
    <b>received in good order and condition</b> on ${esc(fmt(r.receivedAt))}${rows ? ' and added to inventory' : ''}.
  </div>

  <div class="sign-wrap">
    <div class="sign-line"></div>
    <div class="sign-name">${esc(r.receivedBy || '')}</div>
    <div class="sign-role">Received By (signature over printed name)</div>
  </div>`;

  const html = renderPrintDocument({
    title: `Receiving Report - ${r.poNumber}`,
    docTitle: 'RECEIVING REPORT',
    css,
    body,
  });

  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
