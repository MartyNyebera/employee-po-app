// ============================================================================
// The withdrawal receipt — evidence that stock left the shelf, and who authorised it.
// Printed from the production portal (their own withdrawals) and from the admin's review
// queue. Same house style as the other documents (lib/orderPrint.ts, lib/deliveryReceiptPrint.ts):
// A4, Times New Roman, escaped interpolation, a footer fixed to every page, and
// write → close → focus → print.
//
// Three signatories, in the order they act: production asks, the warehouse releases the stock
// from the shelf, the admin authorises — and only that last step deducts. A block fills in as
// each person acts, so the receipt is printable mid-flight and shows exactly how far it got.
//
// The letterhead/footer/title and per-page repeat come from the shared print chrome
// (printChrome.ts); this module only owns the content styles (meta, item table, signatures).
// ============================================================================

import { renderPrintDocument } from './printChrome';

export interface PrintableWithdrawal {
  withdrawalNumber?: string | null;
  itemName?: string | null;
  quantity: number;
  unit?: string | null;
  reason?: string | null;
  requestedByName?: string | null;
  createdAt?: string | null;
  // The warehouse's release — the first approval. No stock moves at this point.
  warehouseBy?: string | null;
  warehouseAt?: string | null;
  // The admin's authorisation — the second, and the one that actually deducts.
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  deductedAt?: string | null;
  prNumber?: string | null;
  // Optional Job Order # the requester typed (format JO-MM-DD-seq-YYYY). Shown only when present.
  jobOrderNo?: string | null;
  status: string;
}

export interface WithdrawalSignatures {
  requestedSignature?: string | null;
  releasedSignature?: string | null;
  approvedSignature?: string | null;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '');

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function printWithdrawalReceipt(
  w0: PrintableWithdrawal,
  loadSignatures?: () => Promise<WithdrawalSignatures | null>,
): Promise<{ ok: boolean; error?: string }> {
  // Open the window synchronously — inside the click — or the popup blocker kills it.
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the withdrawal receipt' };
  w.document.write('<!doctype html><title>Preparing…</title><body style="font:14px sans-serif;padding:2rem;color:#555">Preparing the receipt…</body>');

  let sigs: WithdrawalSignatures = {};
  if (loadSignatures) {
    // A signature lookup failure must not block the receipt — the blocks render unsigned.
    try { sigs = (await loadSignatures()) || {}; } catch { sigs = {}; }
  }

  // A rejected request never reached the admin, so its reviewed_* is the refusal, not an
  // approval — don't print a refusal over an "Approved By" line.
  const approved = w0.status === 'approved';
  // Before approval the same document prints as the REQUEST form — the later signature blocks
  // simply come back blank ruled lines, so it's routable for wet signatures. Once approved it
  // becomes the receipt (stock has left the shelf). All three blocks stay in both states.
  const isReceipt = approved;
  const blocks = [
    { title: 'Requested By', name: w0.requestedByName || '—', sig: sigs.requestedSignature, date: w0.createdAt },
    { title: 'Released By', name: w0.warehouseBy || '', sig: sigs.releasedSignature, date: w0.warehouseAt },
    { title: 'Approved By', name: approved ? (w0.reviewedBy || '') : '', sig: approved ? sigs.approvedSignature : null, date: approved ? w0.reviewedAt : null },
  ];

  const css = `
  /* Header row: reference fields (Ref JO# / Date …) on the left, the WD number in the right
     corner. space-between pins WD No. to the far right; the left items stack one per line. */
  .meta { display: flex; justify-content: space-between; align-items: flex-start; margin: 14px 0; font-size: 10pt; }
  .meta div span { font-weight: bold; }
  .meta-left > div { margin-bottom: 4px; }
  .meta-right { text-align: right; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10pt; }
  table.items th, table.items td { border: 1px solid #000; padding: 5px 6px; }
  table.items th { background: #f0f0f0; }
  .cert { margin: 22px 0 10px; font-size: 10.5pt; line-height: 1.5; }
  /* Three blocks across (Requested / Released / Approved), sharing the width via flex:1 rather
     than a fixed 280px each — 3 × 280 overflows the A4 text column.
     break-inside keeps a signature from being stranded from its name across a page.
     text-align:center centres the name/role/date (and the signature image) under each rule line. */
  .sign-row { display: flex; gap: 20px; margin-top: 26px; break-inside: avoid; }
  .sign-wrap { flex: 1; min-width: 0; text-align: center; }
  /* Fixed height whether or not a signature exists, so all three rule lines stay level. */
  .sign-img { height: 70px; }
  .sign-img img { height: 70px; max-width: 100%; object-fit: contain; }
  .sign-line { border-bottom: 1px solid #000; }
  .sign-name { font-weight: bold; margin-top: 3px; font-size: 10pt; overflow-wrap: break-word; }
  .sign-role { font-size: 9pt; }
  .sign-date { font-size: 8.5pt; color: #333; margin-top: 1px; }
`;

  const body = `
  <div class="meta">
    <div class="meta-left">
      <!-- Ref JO# is always shown for a consistent layout: the entered value when present,
           otherwise "Inhouse" as a display-only fallback (a blank job_order_no still stores NULL). -->
      <div><span>Ref JO#:</span> ${w0.jobOrderNo ? esc(w0.jobOrderNo) : 'Inhouse'}</div>
      ${w0.prNumber ? `<div><span>For request:</span> ${esc(w0.prNumber)}</div>` : ''}
      <div><span>Date Requested:</span> ${esc(fmt(w0.createdAt))}</div>
    </div>
    <div class="meta-right">
      <!-- "Date Withdrawn" is when the stock actually left, i.e. the admin's approval — only the
           receipt carries it. On the pre-approval REQUEST form nothing is withdrawn yet, so the
           label is omitted entirely and the right column is just WD No. (kept graceful). -->
      ${isReceipt ? `<div><span>Date Withdrawn:</span> ${esc(fmt(w0.deductedAt))}</div>` : ''}
      <div><span>WD No.:</span> ${esc(w0.withdrawalNumber || '—')}</div>
    </div>
  </div>

  <table class="items">
    <thead><tr><th>Item</th><th style="width:90px">Quantity</th><th style="width:90px">Unit</th></tr></thead>
    <tbody>
      <tr>
        <td>${esc(w0.itemName || '—')}</td>
        <td style="text-align:center">${esc(w0.quantity)}</td>
        <td style="text-align:center">${esc(w0.unit || '')}</td>
      </tr>
    </tbody>
  </table>

  ${w0.reason ? `<div class="cert"><span style="font-weight:bold">Purpose:</span> ${esc(w0.reason)}</div>` : ''}

  <div class="cert">
    ${isReceipt
      ? `This certifies that the stock above was <b>withdrawn from inventory</b> and released on
         ${esc(fmt(w0.deductedAt))}, on the authority of the approval recorded below.`
      : `<b>Request for withdrawal</b> of the item(s) below. Release and approval are recorded by
         signature below as each step is completed.`}
  </div>

  <div class="sign-row">
    ${blocks.map(b => `
    <div class="sign-wrap">
      <div class="sign-img">${b.sig ? `<img src="${esc(b.sig)}" />` : ''}</div>
      <div class="sign-line"></div>
      <div class="sign-name">${esc(b.name)}</div>
      <div class="sign-role">${b.title}</div>
      ${b.date ? `<div class="sign-date">${esc(fmtDate(b.date))}</div>` : ''}
    </div>`).join('')}
  </div>`;

  const html = renderPrintDocument({
    title: `${isReceipt ? 'Withdrawal Receipt' : 'Withdrawal Request'} - ${w0.withdrawalNumber || ''}`,
    docTitle: isReceipt ? 'STOCK WITHDRAWAL RECEIPT' : 'WITHDRAWAL REQUEST',
    css,
    body,
  });

  // open() resets the document — without it, write() appends onto the "Preparing…" placeholder.
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
