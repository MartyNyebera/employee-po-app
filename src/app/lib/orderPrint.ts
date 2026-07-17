// ============================================================================
// The order documents — ONE template for both purchase orders and sales orders.
//
// Purchase orders are printed by the admin dashboard
// (components/PurchaseOrderList-Professional-Fixed.tsx) and the purchasing portal; sales
// orders by the admin's sales list and the sales portal. All four print the same document
// shape — only the title, the counterparty box and the number differ — so they share this
// module rather than each carrying a copy to keep in sync.
//
// Print-only styling stays 'Times New Roman' — screen UI is Poppins, documents are formal.
// ============================================================================

export interface PrintableLineItem {
  no?: number | string;
  id?: number | string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  unitPrice?: number;
  unitCost?: number;
  amount?: number;
}

export interface PrintablePO {
  poNumber: string;
  client: string;
  description?: string | null;
  amount: number;
  status: string;
  createdDate?: string | null;
  deliveryDate?: string | null;
  docDate?: string | null;
  supplierAddress?: string | null;
  supplierContact?: string | null;
  supplierTin?: string | null;
  // Free text typed into the hand-raised-order form. Only used as a fallback when there is no
  // purchase request behind the order — a PR-linked order names the real people below instead.
  preparedBy?: string | null;
  reviewedBy?: string | null;
  // The five signatories of a PR-linked order, each a recorded event with a timestamp, in the
  // order they act:
  //   requestedBy — the employee who filed the request        (Prepared By)
  //   checkedBy   — the accounting staffer who reviewed it    (Reviewed By)
  //   verifiedBy  — the admin who approved the request        (Approved By)
  //   processedBy — the purchasing staffer who raised the PO  (Processed By)
  //   approvedBy  — the admin who approved the order          (Supervised By)
  //
  // The admin acts twice, and the two are different events on different rows. Approving the
  // REQUEST is what lets purchasing raise the order at all, so it comes before Processed By;
  // approving the ORDER happens after, which is the step the business calls supervision.
  requestedBy?: string | null;
  requestedAt?: string | null;
  checkedBy?: string | null;
  checkedAt?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  processedBy?: string | null;
  processedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  prNumber?: string | null;
  prStatus?: string | null;
}

// Fetched on demand at print time — never carried on the list payload (~20KB each).
// approvedSignature resolves the admin who approved the REQUEST (purchase_requests.
// verified_by_id); supervisedSignature the admin who approved the ORDER (approved_by_id).
export interface POSignatures {
  preparedSignature?: string | null;
  reviewedSignature?: string | null;
  approvedSignature?: string | null;
  processedSignature?: string | null;
  supervisedSignature?: string | null;
}

export interface PrintableSO {
  soNumber: string;
  client: string;
  description?: string | null;
  amount: number;
  status: string;
  createdDate?: string | null;
  deliveryDate?: string | null;
  docDate?: string | null;
  customerAddress?: string | null;
  customerContact?: string | null;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  line?: string | null;
  source?: string | null;
}

const DEFAULT_TERMS = [
  'Prices quoted are firm and valid for 30 days from PO date.',
  'Delivery shall be made to the specified address within the agreed timeframe.',
  'Materials shall conform to specifications and quality standards.',
  'Payment shall be made within 30 days from receipt and acceptance of materials.',
  'This PO is governed by the laws of the Republic of the Philippines.',
];

const DEFAULT_PAYMENT_TERMS = '30 days from receipt/acceptance';
// [removed] DEFAULT_PREPARED_BY = 'Kim Karen D. Tagle' — every order without a preparedBy
// printed that name over the Prepared By line regardless of who actually prepared it. A blank
// line is honest; a real person's name on a document they never touched is not.

const peso = (n: number) =>
  `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

// The document interpolates supplier names, notes and item descriptions written by users.
// Without escaping, a '<' in a product name injects markup into the print window.
// Exported: the purchase-request printouts in the portals build their HTML the same way and
// need the same escaping — one definition rather than a copy per document.
export const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Purchase-order details are serialized into the `description` column as a labelled text
// blob (see POST /api/purchase-orders). Each label occupies one line, and `Line Items:` is
// followed by a single-line JSON array — so read it line-wise. A regex like
// /Line Items:\s*(\[.*?\])/ truncates at the first ']', which any item description
// containing a bracket will trigger.
function blobLine(description: string, label: string): string | null {
  for (const raw of description.split('\n')) {
    const line = raw.trim();
    if (line.startsWith(label)) return line.slice(label.length).trim();
  }
  return null;
}

function blobMoney(description: string, label: string): number | null {
  const v = blobLine(description, label);
  if (v === null) return null;
  const n = parseFloat(v.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseLineItems(po: PrintablePO): PrintableLineItem[] {
  const description = po.description || '';
  const raw = blobLine(description, 'Line Items:');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* fall through to the single-line fallback */ }
  }
  // Legacy orders (and unparseable blobs) print as one lot-priced line.
  return [{
    id: '1', no: 1,
    description: description.split('Line Items:')[0]?.trim() || description || po.client,
    quantity: 1, unit: 'Lot', unitPrice: po.amount, amount: po.amount,
  }];
}

// Both documents share one stylesheet — they are the same paper with a different title.
const SHARED_CSS = `
  @page { margin: 0.5in; size: A4; }
  /* padding-bottom keeps flowing content clear of the fixed page footer */
  body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.3; color: black; margin: 0; padding: 15px; padding-bottom: 40px; background: white; }
  .header-date { text-align: right; font-size: 9pt; margin-bottom: 5px; }
  .system-title { text-align: center; font-size: 10pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px; }
  .company-name { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 3px; }
  .company-address { text-align: center; font-size: 10pt; margin-bottom: 2px; }
  .contact-details { text-align: center; font-size: 9pt; margin-bottom: 2px; }
  .proprietor { text-align: center; font-size: 9pt; font-weight: bold; margin-bottom: 8px; }
  .document-title { text-align: center; font-size: 16pt; font-weight: bold; border: 2px solid black; padding: 8px; margin-bottom: 15px; background: white; }
  .info-section { display: flex; gap: 10px; margin-bottom: 15px; }
  .info-box { flex: 1; border: 1px solid black; padding: 8px; min-height: 60px; }
  .info-box-title { font-weight: bold; font-size: 9pt; margin-bottom: 5px; text-align: center; }
  .info-content { font-size: 8pt; line-height: 1.2; }
  .payment-terms { text-align: center; font-weight: bold; font-size: 9pt; margin-bottom: 15px; padding: 5px; border: 1px solid black; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 8pt; }
  .items-table th { border: 1px solid black; padding: 5px; text-align: center; font-weight: bold; background: #f5f5f5; }
  .items-table td { border: 1px solid black; padding: 4px; text-align: center; }
  .description-col { text-align: left !important; width: 40%; }
  .number-col { width: 8%; }
  .quantity-col { width: 12%; }
  .unit-col { width: 12%; }
  .unit-cost-col { width: 14%; }
  .amount-col { width: 14%; }
  .summary-section { margin-bottom: 15px; }
  /* margin-right:auto (not margin-left) puts the box on the LEFT — a fixed-width block with
     auto on one side is pushed to the opposite edge. Both documents share this rule. */
  .summary-box { border: 1px solid black; padding: 10px; width: 300px; margin-right: auto; }
  .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 9pt; }
  .summary-label { font-weight: bold; }
  .summary-value { text-align: right; }
  .terms-section { font-size: 8pt; margin-bottom: 20px; line-height: 1.3; }
  .signature-section { margin-top: 30px; }
  .approved-header { text-align: center; font-weight: bold; font-size: 10pt; margin-bottom: 15px; letter-spacing: 2px; }
  .approved-header.rejected { text-decoration: line-through; }
  /* Five boxes (Prepared / Reviewed / Approved / Processed / Supervised) share the A4 text
     column, so the gap and the type tighten to fit. flex:1 + min-width:0 lets them shrink
     evenly; without min-width:0 a long name would force the row wider than the page. */
  .signature-boxes { display: flex; gap: 6px; }
  .signature-box { flex: 1; min-width: 0; border: 1px solid black; padding: 6px 4px; text-align: center; }
  .signature-title { font-weight: bold; font-size: 8pt; margin-bottom: 4px; }
  /* Fixed height whether or not a signature exists, so all five rule lines stay level. */
  .signature-img { height: 46px; margin-bottom: -2px; }
  .signature-img img { height: 46px; max-width: 100%; object-fit: contain; }
  .signature-line { border-bottom: 1px solid black; margin: 0 0 4px 0; }
  /* Long names wrap rather than overflow the box — five across leaves ~1.3in each. */
  .signature-name { font-size: 7.5pt; font-weight: bold; overflow-wrap: break-word; }
  .signature-date { font-size: 7pt; color: #333; margin-top: 1px; }
  .computer-generated { text-align: center; font-size: 8pt; font-style: italic; margin-top: 10px; }
  /* Real page footer: pinned to the bottom of EVERY printed page, not just the last. */
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 8pt; color: #333; border-top: 1px solid #ccc; padding-top: 6px; background: #fff; }
`;

// `loadSignatures` is injected rather than imported because each caller holds a DIFFERENT
// authed fetch — the admin list uses fetchApi, the purchasing portal pFetch, the logistics
// portal lFetch. Optional: omit it and the document prints with blank signature lines.
export async function printPurchaseOrder(
  po: PrintablePO,
  loadSignatures?: () => Promise<POSignatures | null>,
): Promise<{ ok: boolean; error?: string }> {
  // Open the window synchronously — inside the click — or the popup blocker kills it. The
  // signature fetch happens after, into the already-open window.
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the purchase order' };
  w.document.write('<!doctype html><title>Preparing…</title><body style="font:14px sans-serif;padding:2rem;color:#555">Preparing the purchase order…</body>');

  let sigs: POSignatures = {};
  if (loadSignatures) {
    // A signature lookup failure must not block the document — the blocks render unsigned.
    try { sigs = (await loadSignatures()) || {}; } catch { sigs = {}; }
  }

  const description = po.description || '';
  const lineItems = parseLineItems(po);

  // Real columns beat anything parsed out of the blob. This resolution sits OUTSIDE any
  // try/catch: in the original it was inside the parse block, so a failed line-item parse
  // silently discarded the good column values too.
  const address = po.supplierAddress || blobLine(description, 'Address:') || '';
  const contact = po.supplierContact || blobLine(description, 'Contact:') || '';
  const paymentTerms = po.paymentTerms || blobLine(description, 'Payment Terms:') || DEFAULT_PAYMENT_TERMS;

  // The five signatories, in the order they actually act. A PR-linked order names the people
  // who really did each step; a hand-raised one has no request behind it and falls back to the
  // free-text fields its own form captured (which carry no date and no signature).
  const preparedBy = po.requestedBy || po.preparedBy?.trim() || blobLine(description, 'Prepared By:') || '';
  const reviewedBy = po.checkedBy || po.reviewedBy || blobLine(description, 'Reviewed By:') || '';
  const processedBy = po.processedBy || '';
  // Approved By is the admin's approval of the REQUEST, which is what allows the order to be
  // raised — hence its place before Processed By. It fills the moment the request is approved,
  // before this order exists. A hand-raised order has no request to approve, so it prints
  // blank: the admin's sign-off on it appears under Supervised By instead.
  const isSupervised = po.status === 'approved';
  const signatories = [
    { title: 'Prepared By:', name: preparedBy, sig: sigs.preparedSignature, date: po.requestedAt },
    { title: 'Reviewed By:', name: reviewedBy, sig: sigs.reviewedSignature, date: po.checkedAt },
    { title: 'Approved By:', name: po.verifiedBy || '', sig: sigs.approvedSignature, date: po.verifiedAt },
    { title: 'Processed By:', name: processedBy, sig: sigs.processedSignature, date: po.processedAt },
    // Only stamp the supervisor once the order is actually approved. The approve route stamps
    // approved_by even on a rejection (the PO has no 'disapproved' status), so without this
    // gate a rejected order would print a sign-off that never happened.
    { title: 'Supervised By:', name: isSupervised ? (po.approvedBy || '') : '', sig: isSupervised ? sigs.supervisedSignature : null, date: isSupervised ? po.approvedAt : null },
  ];

  // Totals come from the blob when present; the previous template hardcoded 0.00 for VAT
  // even though a real figure was stored. There is no EWT here: no form transmits one, so
  // the order record has never carried it (the create forms' EWT fields are display-only).
  const subTotal = blobMoney(description, 'Sub Total:') ?? po.amount;
  const otherCharges = blobMoney(description, 'Other Charges:') ?? 0;
  const vatAmount = blobMoney(description, 'VAT Amount:') ?? 0;
  const totalAmount = blobMoney(description, 'Total Amount:') ?? po.amount;

  const termLines = po.termsAndConditions
    ? String(po.termsAndConditions).split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    : DEFAULT_TERMS;
  const termsHtml = termLines.map((l, i) => `${i + 1}. ${esc(l)}`).join('<br>');

  // A rejected order keeps status 'pending' (purchase_orders' CHECK has no 'disapproved'),
  // so status alone cannot distinguish "rejected" from "awaiting approval" — hence prStatus.
  const isApproved = po.status === 'approved';
  const isRejected = po.prStatus === 'disapproved';
  const stamp = isApproved ? '<div class="approved-header">APPROVED</div>'
    : isRejected ? '<div class="approved-header rejected">REJECTED</div>'
    : '';

  const rows = lineItems.map((it, i) => `
    <tr>
      <td class="number-col">${esc(it.no ?? it.id ?? i + 1)}</td>
      <td class="description-col">${esc(it.description || '')}</td>
      <td class="quantity-col">${esc(it.quantity ?? 1)}</td>
      <td class="unit-col">${esc(it.unit || 'Lot')}</td>
      <td class="unit-cost-col">${peso(Number(it.unitCost ?? it.unitPrice ?? it.amount ?? 0))}</td>
      <td class="amount-col">${peso(Number(it.amount ?? 0))}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Purchase Order - ${esc(po.poNumber)}</title>
<style>${SHARED_CSS}</style></head>
<body>
  <div class="header-date">${esc(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))} &nbsp;&nbsp;&nbsp;&nbsp; Purchase Order</div>
  <div class="system-title">KIMOEL TRACKING SYSTEM</div>
  <div class="company-name">KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
  <div class="company-address">PUROK 1, LODLOD, LIPA CITY, BATANGAS</div>
  <div class="contact-details">Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com</div>
  <div class="proprietor">LEO TAGLE (Mobile: 0917 - 628 - 3217)</div>
  <div class="document-title">PURCHASE ORDER</div>

  <div class="info-section">
    <div class="info-box">
      <div class="info-box-title">SUPPLIER NAME AND ADDRESS</div>
      <div class="info-content">
        ${esc(po.client)}<br>
        ${esc(address)}<br>
        ${esc(contact)}
        ${po.supplierTin ? `<br>TIN: ${esc(po.supplierTin)}` : ''}
      </div>
    </div>
    <div class="info-box">
      <div class="info-box-title">BILL TO</div>
      <div class="info-content">
        KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED<br>
        PUROK 1, LODLOD, LIPA CITY, BATANGAS<br>
        Tel: (043) - 741 - 2023<br>
        Email: kimoel_leotagle@yahoo.com
      </div>
    </div>
    <div class="info-box">
      <div class="info-content">
        <strong>PO Date:</strong> ${esc(fmtDate(po.docDate || po.createdDate))}<br>
        <strong>PO Number:</strong> ${esc(po.poNumber)}<br>
        ${po.prNumber ? `<strong>PR Number:</strong> ${esc(po.prNumber)}<br>` : ''}
        <strong>Delivery Date:</strong> ${esc(fmtDate(po.deliveryDate))}<br>
        <strong>Page:</strong> 1 of 1
      </div>
    </div>
  </div>

  <div class="payment-terms">PAYMENT TERMS: ${esc(paymentTerms)}</div>

  <table class="items-table">
    <thead>
      <tr>
        <th class="number-col">No.</th>
        <th class="description-col">Description</th>
        <th class="quantity-col">Quantity</th>
        <th class="unit-col">Unit</th>
        <th class="unit-cost-col">Unit Cost</th>
        <th class="amount-col">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary-section">
    <div class="summary-box">
      <div class="summary-row"><div class="summary-label">Sub Total:</div><div class="summary-value">${peso(subTotal)}</div></div>
      <div class="summary-row"><div class="summary-label">Other Charges:</div><div class="summary-value">${peso(otherCharges)}</div></div>
      <div class="summary-row"><div class="summary-label">VAT Amount:</div><div class="summary-value">${peso(vatAmount)}</div></div>
      <div class="summary-row"><div class="summary-label">Total Amount:</div><div class="summary-value">${peso(totalAmount)}</div></div>
    </div>
  </div>

  <div class="terms-section">
    <strong>TERMS &amp; CONDITIONS:</strong><br>
    ${termsHtml}
  </div>

  <div class="signature-section">
    ${stamp}
    <div class="signature-boxes">
      ${signatories.map(s => `
      <div class="signature-box">
        <div class="signature-title">${s.title}</div>
        <div class="signature-img">${s.sig ? `<img src="${esc(s.sig)}" />` : ''}</div>
        <div class="signature-line"></div>
        <div class="signature-name">${esc(s.name)}</div>
        ${s.date ? `<div class="signature-date">${esc(new Date(s.date).toLocaleDateString())}</div>` : ''}
      </div>`).join('')}
    </div>
  </div>

  <div class="footer">PO ${esc(po.poNumber)} | Purchase Order | KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
</body></html>`;

  // open() resets the document — without it, write() appends onto the "Preparing…" placeholder.
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Do not close the window here: onload fires unreliably on a document.write'd window and
  // closing it can kill the print dialog before the user acts on it.
  w.onload = () => { w.print(); };
  return { ok: true };
}

// ============================================================================
// Sales order — the same document, addressed to a customer rather than a supplier. Sales
// orders serialize their line items into `description` with the identical labelled-blob
// format, so the parsers above are reused as-is.
// ============================================================================
export function printSalesOrder(so: PrintableSO): { ok: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print the sales order' };

  const description = so.description || '';
  // parseLineItems only reads .description and .amount/.client — shape-compatible.
  const lineItems = parseLineItems({ ...so, poNumber: so.soNumber } as unknown as PrintablePO);

  const address = so.customerAddress || blobLine(description, 'Address:') || '';
  const contact = so.customerContact || blobLine(description, 'Contact:') || '';
  // Was `|| DEFAULT_PREPARED_BY` — a constant deleted above, which this line kept referencing.
  // With no tsconfig, `vite build` is esbuild-only and never caught it, so printing any sales
  // order threw ReferenceError at runtime. A blank line is the honest fallback anyway.
  const preparedBy = so.preparedBy?.trim() || blobLine(description, 'Prepared By:') || '';
  const reviewedBy = so.reviewedBy || blobLine(description, 'Reviewed By:') || '';
  const paymentTerms = so.paymentTerms || blobLine(description, 'Payment Terms:') || DEFAULT_PAYMENT_TERMS;

  const subTotal = blobMoney(description, 'Sub Total:') ?? so.amount;
  const otherCharges = blobMoney(description, 'Other Charges:') ?? 0;
  const vatAmount = blobMoney(description, 'VAT Amount:') ?? 0;
  const totalAmount = blobMoney(description, 'Total Amount:') ?? so.amount;

  const termLines = so.termsAndConditions
    ? String(so.termsAndConditions).split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    : DEFAULT_TERMS;
  const termsHtml = termLines.map((l, i) => `${i + 1}. ${esc(l)}`).join('<br>');

  const isApproved = so.status === 'approved';
  const stamp = isApproved ? '<div class="approved-header">APPROVED</div>' : '';

  const rows = lineItems.map((it, i) => `
    <tr>
      <td class="number-col">${esc(it.no ?? it.id ?? i + 1)}</td>
      <td class="description-col">${esc(it.description || '')}</td>
      <td class="quantity-col">${esc(it.quantity ?? 1)}</td>
      <td class="unit-col">${esc(it.unit || 'Lot')}</td>
      <td class="unit-cost-col">${peso(Number(it.unitCost ?? it.unitPrice ?? it.amount ?? 0))}</td>
      <td class="amount-col">${peso(Number(it.amount ?? 0))}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sales Order - ${esc(so.soNumber)}</title>
<style>${SHARED_CSS}</style></head>
<body>
  <div class="header-date">${esc(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))} &nbsp;&nbsp;&nbsp;&nbsp; Sales Order</div>
  <div class="system-title">KIMOEL TRACKING SYSTEM</div>
  <div class="company-name">KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
  <div class="company-address">PUROK 1, LODLOD, LIPA CITY, BATANGAS</div>
  <div class="contact-details">Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com</div>
  <div class="proprietor">LEO TAGLE (Mobile: 0917 - 628 - 3217)</div>
  <div class="document-title">SALES ORDER</div>

  <div class="info-section">
    <div class="info-box">
      <div class="info-box-title">CUSTOMER NAME AND ADDRESS</div>
      <div class="info-content">
        ${esc(so.client)}<br>
        ${esc(address)}<br>
        ${esc(contact)}
      </div>
    </div>
    <div class="info-box">
      <div class="info-box-title">FROM</div>
      <div class="info-content">
        KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED<br>
        PUROK 1, LODLOD, LIPA CITY, BATANGAS<br>
        Tel: (043) - 741 - 2023<br>
        Email: kimoel_leotagle@yahoo.com
      </div>
    </div>
    <div class="info-box">
      <div class="info-content">
        <strong>SO Date:</strong> ${esc(fmtDate(so.docDate || so.createdDate))}<br>
        <strong>SO Number:</strong> ${esc(so.soNumber)}<br>
        ${so.line ? `<strong>Line:</strong> ${esc(so.line)}<br>` : ''}
        <strong>Delivery Date:</strong> ${esc(fmtDate(so.deliveryDate))}<br>
        <strong>Page:</strong> 1 of 1
      </div>
    </div>
  </div>

  <div class="payment-terms">PAYMENT TERMS: ${esc(paymentTerms)}</div>

  <table class="items-table">
    <thead>
      <tr>
        <th class="number-col">No.</th>
        <th class="description-col">Description</th>
        <th class="quantity-col">Quantity</th>
        <th class="unit-col">Unit</th>
        <th class="unit-cost-col">Unit Price</th>
        <th class="amount-col">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary-section">
    <div class="summary-box">
      <div class="summary-row"><div class="summary-label">Sub Total:</div><div class="summary-value">${peso(subTotal)}</div></div>
      <div class="summary-row"><div class="summary-label">Other Charges:</div><div class="summary-value">${peso(otherCharges)}</div></div>
      <div class="summary-row"><div class="summary-label">VAT Amount:</div><div class="summary-value">${peso(vatAmount)}</div></div>
      <div class="summary-row"><div class="summary-label">Total Amount:</div><div class="summary-value">${peso(totalAmount)}</div></div>
    </div>
  </div>

  <div class="terms-section">
    <strong>TERMS &amp; CONDITIONS:</strong><br>
    ${termsHtml}
  </div>

  <div class="signature-section">
    ${stamp}
    <div class="signature-boxes">
      <div class="signature-box">
        <div class="signature-title">Prepared By:</div>
        <div class="signature-line"></div>
        <div class="signature-name">${esc(preparedBy)}</div>
      </div>
      <div class="signature-box">
        <div class="signature-title">Reviewed By:</div>
        <div class="signature-line"></div>
        <div class="signature-name">${esc(reviewedBy)}</div>
      </div>
      <div class="signature-box">
        <div class="signature-title">Received By:</div>
        <div class="signature-line"></div>
        <div class="signature-name"></div>
      </div>
    </div>
  </div>

  <div class="computer-generated">Computer Generated - No Signature Required</div>
  <div class="footer">SO ${esc(so.soNumber)} | Sales Order | KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
</body></html>`;

  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
