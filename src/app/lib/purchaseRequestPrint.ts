import { toast } from 'sonner';
import { esc } from './orderPrint';
import { renderPrintDocument } from './printChrome';

// The printable purchase-request document, extracted so BOTH the production portal
// (src/app/pages/RequestsPage.tsx, via empFetch) and the admin Purchase-Requests review
// (crm/PurchaseRequestsReview.tsx, via fetchApi) render the exact same document — one template,
// one thing to keep correct. The caller injects the signature fetch (its own authed client),
// matching the pattern in withdrawalReceiptPrint.ts.
//
// The three signatures ALL come from the /signatures response (prepared = the employee's, from
// employee_accounts; checked = the accounting snapshot; approved = the admin's, live). The old
// inline portal version read "prepared" from component state — reading it from the response
// instead is what lets the admin print the same document without the employee being signed in.

export interface PrintablePRItem {
  description?: string | null;
  kind?: string | null;
  laborNote?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unitCost?: number | null;
  amount?: number | null;
  finalUnitCost?: number | null;
  finalAmount?: number | null;
}

export interface PrintablePR {
  id: string;
  prNumber: string;
  employeeName?: string | null;
  projectName?: string | null;
  neededBy?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  items: PrintablePRItem[];
  total: number;
  finalTotal?: number | null;
  checkedBy?: string | null;
  checkedAt?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
}

export interface PRSignatures {
  preparedSignature: string | null;
  checkedSignature: string | null;
  approvedSignature: string | null;
}

const peso = (n: unknown) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function printPurchaseRequest(
  req: PrintablePR,
  fetchSignatures: () => Promise<PRSignatures>,
): Promise<{ ok: boolean; error?: string }> {
  // Open the window synchronously — inside the click — or the popup blocker kills it.
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: 'Please allow popups to print' };
  w.document.write('<!doctype html><title>Preparing…</title><body style="font:14px sans-serif;padding:2rem;color:#555">Preparing the request…</body>');

  let preparedSignature: string | null = null;
  let checkedSignature: string | null = null;
  let approvedSignature: string | null = null;
  try {
    const s = await fetchSignatures();
    preparedSignature = s.preparedSignature;
    checkedSignature = s.checkedSignature;
    approvedSignature = s.approvedSignature;
  } catch {
    // A signature lookup failure must not block the document — the blocks render unsigned.
    toast.error('Could not load signatures; printing without them');
  }

  // Once Purchasing has priced the request, the printout shows the FINAL cost; until then the
  // employee estimate. Matches the on-screen behaviour of the admin review list.
  const priced = req.finalTotal !== null && req.finalTotal !== undefined;

  const rows = req.items.map((it, i) => {
    const unitCost = priced ? (it.finalUnitCost ?? it.unitCost) : it.unitCost;
    const amount = priced ? (it.finalAmount ?? it.amount) : it.amount;
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.description || '')}${it.kind === 'labor' ? ' <span style="font-size:8pt;color:#555;font-style:italic">(labor)</span>' : ''}${it.laborNote ? `<div style="font-size:8pt;color:#555;white-space:pre-wrap">${esc(it.laborNote)}</div>` : ''}</td>
        <td style="text-align:center">${it.kind === 'labor' ? '—' : esc(it.quantity ?? '')}</td>
        <td style="text-align:center">${it.kind === 'labor' ? '—' : esc(it.unit || '')}</td>
        <td style="text-align:right">${peso(unitCost)}</td>
        <td style="text-align:right">${peso(amount)}</td>
      </tr>`;
  }).join('');

  const total = priced ? (req.finalTotal ?? req.total) : req.total;

  const sigImg = (src: string | null) => src
    ? `<img class="sign-img" src="${esc(src)}" />`
    : `<div style="height:60px"></div>`;
  const signDate = (d?: string | null) =>
    d ? `<div class="sign-date">${esc(new Date(d).toLocaleDateString())}</div>` : '';

  const css = `
      .meta { display:flex; justify-content:space-between; align-items:flex-start; margin:14px 0; font-size:10pt; }
      .meta .meta-left div { margin-bottom:3px; }
      .meta .meta-left span, .meta .meta-right span { font-weight:bold; }
      .meta .meta-right { text-align:right; }
      table.items { width:100%; border-collapse:collapse; margin-top:6px; font-size:10pt; }
      table.items th, table.items td { border:1px solid #000; padding:5px 6px; }
      table.items th { background:#f0f0f0; }
      .total { text-align:right; font-weight:bold; margin-top:8px; font-size:11pt; }
      .notes { margin:14px 0 6px; font-size:10.5pt; line-height:1.5; }
      .signs { display:flex; gap:20px; margin-top:40px; break-inside:avoid; }
      .sign { flex:1; min-width:0; text-align:center; }
      .sign-img { height:60px; object-fit:contain; margin-bottom:-6px; }
      .sign-line { border-top:1px solid #000; padding-top:3px; font-weight:bold; font-size:10pt; overflow-wrap:break-word; }
      .sign-role { font-size:8.5pt; color:#333; }
      .sign-date { font-size:8.5pt; color:#333; margin-top:1px; }
`;
  const body = `
      <div class="meta">
        <div class="meta-left">
          <div><span>For (Project):</span> ${esc(req.projectName || 'Personal use')}</div>
          <div><span>Date filed:</span> ${esc(req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—')}</div>
          <div><span>Needed by:</span> ${esc(req.neededBy ? new Date(req.neededBy).toLocaleDateString() : '—')}</div>
        </div>
        <div class="meta-right"><span>PR No.:</span> ${esc(req.prNumber)}</div>
      </div>
      <div class="document-title" style="margin:12px auto 4px">PURCHASE REQUEST</div>
      <table class="items">
        <thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Unit</th><th>${priced ? 'Final Cost' : 'Est. Cost'}</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total: ${peso(total)}</div>
      ${req.notes ? `<div class="notes"><span style="font-weight:bold">Notes:</span> ${esc(req.notes)}</div>` : ''}
      <div class="signs">
        <div class="sign">
          ${sigImg(preparedSignature)}
          <div class="sign-line">${esc(req.employeeName || '')}</div>
          <div class="sign-role">Prepared By</div>
          ${signDate(req.createdAt)}
        </div>
        <div class="sign">
          ${sigImg(checkedSignature)}
          <div class="sign-line">${esc(req.checkedBy || '')}</div>
          <div class="sign-role">Reviewed By</div>
          ${signDate(req.checkedAt)}
        </div>
        <div class="sign">
          ${sigImg(approvedSignature)}
          <div class="sign-line">${esc(req.verifiedBy || '')}</div>
          <div class="sign-role">Approved By</div>
          ${signDate(req.verifiedAt)}
        </div>
      </div>`;

  const html = renderPrintDocument({
    title: `Purchase Request ${req.prNumber}`,
    docTitle: '',
    css,
    body,
  });
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
  return { ok: true };
}
