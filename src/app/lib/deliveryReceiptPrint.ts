// ============================================================================
// The delivery receipt — printed from the logistics portal (/logistics).
// Same house style as the order documents (lib/orderPrint.ts): A4, Times New Roman,
// escaped interpolation, write → close → focus → print. The letterhead/footer/title and the
// per-page repeat come from the shared print chrome (printChrome.ts); this module only owns
// the content styles (meta rows, boxes, item table, signature).
// ============================================================================

import { renderPrintDocument } from './printChrome';

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
// The INBOUND delivery receipt. The one above says goods left for a customer; this says goods
// arrived from a supplier against a purchase order, and lists what went onto the shelf as a
// result. Same paper, same title, opposite direction — the "RECEIVED FROM" box and the PO
// number are what tell them apart on the page.
// ============================================================================

export interface ReceivedLine { itemName: string; added: number; newQuantity?: number }

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
  if (!w) return { ok: false, error: 'Please allow popups to print the delivery receipt' };

  const recorded = Array.isArray(r.items);
  const rows = (r.items || []).map((it, i) => `
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
    <thead><tr><th style="width:40px">No</th><th>Item added to inventory</th><th style="width:90px">Received</th><th style="width:110px">New stock</th></tr></thead>
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
    title: `Delivery Receipt - ${r.poNumber}`,
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
