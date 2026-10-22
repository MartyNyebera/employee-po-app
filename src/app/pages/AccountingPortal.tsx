import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, PenTool, Menu, X, Search, Clock, Calendar, CheckCircle2, XCircle, Printer, LogOut,
  Upload, Eraser, Eye, Briefcase, Plus, Trash2, Pencil, PanelLeftClose, PanelLeftOpen, FileText,
  Building2, Receipt, Ban, ArrowLeftRight, Split,
} from 'lucide-react';
import { toast } from 'sonner';
import { onBackdropDown, backdropClose } from '../lib/backdrop';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { esc, printPurchaseOrder } from '../lib/orderPrint';
import { AllocationTag, AllocationFilter, matchesAllocation, type AllocType } from '../components/AllocationTag';
import { CollectionsReport } from '../components/CollectionsReport';
import { renderPrintDocument } from '../lib/printChrome';
import {
  AccountingNav, loadNavPrefs, saveNavPrefs, toggleGroup as toggleGroupPrefs, revealGroupFor, setMinimized,
  type AccountingView, type NavPrefs,
} from '../components/AccountingSidebarNav';
import { AttentionCard } from '../components/AttentionCard';
import { CreatePurchaseRequestForm } from '../components/CreatePurchaseRequestForm';
import { WithdrawalTab } from '../components/WithdrawalTab';
import { nextDeptFor } from '../lib/nextDept';
import { TimesheetReview } from '../components/crm/TimesheetReview';
// The SAME screen the admin dashboard uses, handed this portal's accounting-token fetch. Shared
// rather than reimplemented so a field added for billing appears in both places at once.
import { CustomersList } from '../components/crm/CustomersList';
// The client-facing BIR delivery receipt. Handed this portal's accounting-token fetch, same
// as the other shared crm screens.
import { DeliveryReceipts } from '../components/crm/DeliveryReceipts';
import { BillingInvoices, Receivables } from '../components/crm/BillingInvoices';
import { TradingProfitBars } from '../components/TradingProfitBars';
import { DualBasisProfit, type DualBasisRow, type BasisTotals } from '../components/DualBasisProfit';
import { ExpensesHistory, type TargetOption } from '../components/ExpensesHistory';
import { DisbursementVoucherModal } from '../components/DisbursementVoucher';
import { PayableReport } from '../components/PayableReport';
import { PayrollReview } from '../components/crm/PayrollReview';

// ============================================================================
// Accounting portal (/accounting). Fully independent of the admin dashboard:
// accounting staff sign in with a dedicated Accounting Account (created by an
// admin), using its OWN token/session — separate from the admin `fleet_auth`
// and from the other portals' tokens.
//
// Accounting is the FIRST gate of the purchase-request flow:
//   employee files PR → ACCOUNTING reviews → purchasing raises a PO → admin
//   approves that PO (which is what finally approves the PR).
// They also own project master data.
// ============================================================================

type PRStatus = 'pending' | 'reviewed' | 'verified' | 'ordered' | 'approved' | 'disapproved';
type PortalView = AccountingView;

// Section C — #12: Accounting is also the FIRST gate of the purchase-ORDER flow. Purchasing
// raises an order ('pending'); Accounting reviews it here (→ 'accounting-approved', passing it
// to Admin; or → 'rejected', back to Purchasing). The fields below are what the order document
// and the review row need — all returned by GET /purchase-orders.
interface PurchaseOrder {
  id: string; poNumber: string; client: string; amount: number; status: string;
  createdDate?: string | null; deliveryDate?: string | null; prNumber?: string | null;
  processedBy?: string | null; description?: string | null; docDate?: string | null;
  supplierAddress?: string | null; supplierContact?: string | null; supplierTin?: string | null;
  paymentTerms?: string | null; termsAndConditions?: string | null;
  poReviewedBy?: string | null; poReviewedAt?: string | null; approvedBy?: string | null; approvedAt?: string | null;
  // What the order was bought for -- resolved by the server from its purchase request.
  allocationType?: AllocType | null; allocationName?: string | null; allocationId?: string | null; allocationKey?: string | null;
}

interface PRItem { no?: number; description: string; quantity: number; unit: string; unitCost: number; amount: number; }
interface PurchaseRequest {
  id: string; prNumber: string; employeeName?: string; projectName?: string | null;
  projectId?: string | null; facilityId?: string | null; facilityName?: string | null; finalTotal?: number | null;
  neededBy?: string; supplier?: string; notes?: string; items: PRItem[]; total: number;
  status: PRStatus; checkedBy?: string | null; checkedAt?: string | null; checkedSignature?: string | null;
  // The admin's approval of the request — the printed "Approved By" block. Distinct from
  // reviewedBy, which is the admin's later approval of the resulting purchase order.
  verifiedBy?: string | null; verifiedAt?: string | null;
  reviewedBy?: string; createdAt?: string;
}
interface Project {
  id: string; name: string; description?: string; status?: string; client?: string;
  location?: string; startDate?: string; endDate?: string; budgetAllocation?: number;
  contractPrice?: number | null; netProfitPercent?: number | null;
  contractPriceVat?: VatBasis;
}
// How an entered price is to be read. Supplier and client prices arrive both ways, so the number
// alone is ambiguous and each one carries its own tag. 'exempt' is VAT-free on both bases — it is
// offered because purchase_orders.vat_type can already be 'non-vatable', so a VAT-free trade is
// representable on the buy side and the sell side must be able to say the same.
type VatBasis = 'inclusive' | 'exclusive' | 'exempt';
const VAT_BASIS_OPTIONS: { value: VatBasis; label: string; hint: string }[] = [
  { value: 'inclusive', label: 'VAT-inclusive', hint: 'The price already contains 12% VAT (the usual case — type it exactly as quoted or billed)' },
  { value: 'exclusive', label: 'VAT-exclusive', hint: 'The price is net of VAT; 12% would be added on top' },
  { value: 'exempt', label: 'VAT-exempt / zero-rated', hint: 'No VAT either way — both bases show this number unchanged' },
];
// Internal company facility (equipment/items used internally, not a client project). Simpler than a
// Project — just a budget target; spend is tracked from the purchase requests charged to it.
interface Facility {
  id: string; name: string; description?: string; status?: string;
  location?: string; budgetAllocation?: number;
}
// A TRADING DEAL as a cost centre — the third sibling of Project and Facility. It carries a selling
// price rather than a budget, because the useful question for a trade is margin, not budget adherence.
//
// Not to be confused with the sales-line taxonomy ('Trading (electrical)', 'Trading (mechanical)')
// used on inquiries and sales orders. Same word, unrelated concept.
interface Trading {
  id: string; name: string; client?: string | null; status?: string;
  sellingPrice?: number | null; salesOrderId?: string | null;
  sellingPriceVat?: VatBasis;
}
// Spend is never summed in the browser. GET /api/projects/spend, /api/tradings/spend and
// /api/facilities/spend are the one definition (PROJECT_SPEND_SQL and friends in server/index.js),
// shared with the admin dashboard chart.
// One basis's figures, computed server-side. revenue / profit / marginPercent are null until a
// non-zero price is set, which is what keeps "not priced yet" distinct from a real zero.
interface BasisFigures {
  revenue: number | null; cost: number; costPrs: number; costExpenses: number;
  profit: number | null; marginPercent: number | null;
}
interface ProjectSpend {
  projectId: string; name: string; budget: number; spentPrs: number; spentExpenses: number;
  spent: number; remaining: number; overBudget: number;
  contractPrice: number | null; contractPriceVat: VatBasis;
  exVat: BasisFigures; incVat: BasisFigures;
}
// GET /api/profit-rollup — totals across all PRICED rows, on both bases, summed in SQL.
interface ProfitRollup {
  vatRate: number;
  projects: BasisTotals;
  tradings: BasisTotals;
}
// margin (profit) and marginPercent both come from TRADING_SPEND_SQL already computed — this screen
// never does money math. Both are null until a non-zero selling price exists, which is what makes
// "set selling price" distinguishable from a genuine zero margin.
interface TradingSpend {
  tradingId: string; name: string; client?: string | null; status?: string;
  sellingPrice: number | null; spentPrs: number; spentExpenses: number; spent: number;
  margin: number | null; marginPercent: number | null;
  sellingPriceVat: VatBasis;
  exVat: BasisFigures; incVat: BasisFigures;
}
interface FacilitySpend { facilityId: string; spentPrs: number; spentExpenses: number; spent: number; }

// What a target can be. One expense is split across allocation lines, and each line charges exactly
// ONE of these — enforced by a num_nonnulls CHECK in the DB, not just here.
type TargetKind = 'project' | 'trading' | 'facility';
interface TargetRef { kind: TargetKind; id: string; name: string }
const TARGET_PATH: Record<TargetKind, string> = { project: 'projects', trading: 'tradings', facility: 'facilities' };

// ONE allocation line as the server returns it: this target's own share (`amount`) plus the receipt
// it came from (`expenseTotal`), so a split can be explained without fetching its sibling lines.
// `amount` here and `expenseTotal` are both receipt money, VAT included — PR spend is VAT-exclusive;
// the difference is deliberate and must not be "fixed".
interface ExpenseAllocation {
  allocationId: number; expenseId: number; serialNo?: string | null;
  projectId?: string | null; tradingId?: string | null; facilityId?: string | null;
  amount: number; expenseTotal: number; isSplit: boolean; allocationCount: number;
  // How many purchase orders the same voucher also pays. Voiding from here voids the whole voucher.
  poPaymentCount?: number;
  targets?: string | null;
  description: string; expenseDate: string;
  payee?: string | null; referenceNo?: string | null; createdBy?: string | null; createdAt?: string;
  voidedAt?: string | null; voidedBy?: string | null; voidReason?: string | null;
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

const TOKEN_KEY = 'accounting_token';
const SESSION_KEY = 'accounting_session';
// 'Completed' is deliberately NOT offered here. It is the soft-archive flag that pulls a project
// out of the purchase-request picker, and marking one complete is an ADMIN-only action (the button
// in the admin portal's Projects screen) so that completed_by/completed_at are always stamped.
// Accounting can still edit everything else about a project, completed or not.
const PROJECT_STATUSES = ['Active', 'On Hold'];
// If a project is already Completed, keep its own value in the list so opening this form to edit,
// say, the budget doesn't silently reset an archived project back to Active.
const statusOptionsFor = (current?: string) =>
  current && !PROJECT_STATUSES.includes(current) ? [...PROJECT_STATUSES, current] : PROJECT_STATUSES;

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusLabel = (s: PRStatus) => s.charAt(0).toUpperCase() + s.slice(1);
// Matches the Production portal: plain brand-gold text, no pill background or border.
// The word itself (Pending / Reviewed / Ordered / Approved / Disapproved) carries the meaning.
const statusPill = (_s: PRStatus): string => 'text-brand-gold';

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// Accounting-authed fetch (sends accounting_token). Distinct from admin client.ts and other portals.
async function aFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers } as Record<string, string>;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY);
    throw new Error('Your session expired — please sign in again.');
  }
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || `HTTP ${res.status}`); }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ============================================================================
// Login (its own endpoint — /api/accounting/login)
// ============================================================================
function AccountingLogin({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/accounting/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.accounting));
      onLoggedIn(data.accounting);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-4">
          <img src="/kimoel-logo.png" alt="Kimoel" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Accounting</h1>
            <p className="text-sm text-gray-500">Sign in with your accounting account</p>
          </div>
        </div>
        <form onSubmit={submit} className="p-8 pt-2 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-xs text-gray-400 text-center">No account? Ask your admin to create one for you.</p>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Printable proof-of-review report (new-window HTML). Times New Roman by design:
// printed documents keep the formal serif, the screen UI uses Poppins.
// ============================================================================
async function printReviewReport(pr: PurchaseRequest) {
  // Open the window synchronously — inside the click — or the popup blocker kills it. The
  // signature fetch happens after, into the already-open window.
  const w = window.open('', '_blank');
  if (!w) { toast.error('Please allow popups to print the report'); return; }
  w.document.write('<!doctype html><title>Preparing…</title><body style="font:14px sans-serif;padding:2rem;color:#555">Preparing the report…</body>');

  // Signatures are ~20KB each and are not carried on the request list; fetch them per document.
  let preparedSignature: string | null = null;
  let approvedSignature: string | null = null;
  let checkedSignature: string | null = pr.checkedSignature ?? null;
  try {
    const s = await aFetch<{ preparedSignature: string | null; checkedSignature: string | null; approvedSignature: string | null }>(`/purchase-requests/${pr.id}/signatures`);
    preparedSignature = s.preparedSignature;
    approvedSignature = s.approvedSignature;
    checkedSignature = s.checkedSignature ?? checkedSignature;
  } catch {
    // A signature lookup failure must not block the printout — the blocks just render unsigned.
    toast.error('Could not load signatures; printing without them');
  }

  const rows = pr.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.description || '')}</td>
      <td style="text-align:center">${esc(it.quantity ?? '')}</td>
      <td style="text-align:center">${esc(it.unit || '')}</td>
      <td style="text-align:right">${peso(it.unitCost)}</td>
      <td style="text-align:right">${peso(it.amount)}</td>
    </tr>`).join('');
  const checkedDate = pr.checkedAt ? new Date(pr.checkedAt).toLocaleString() : '—';
  const verifiedDate = pr.verifiedAt ? new Date(pr.verifiedAt).toLocaleString() : '—';
  // Fixed-height slot whether or not a signature exists, so the two blocks' rule lines align.
  const sigImg = (src: string | null) => src
    ? `<img src="${esc(src)}" style="height:70px;object-fit:contain" />`
    : `<div style="height:70px"></div>`;
  // Date under each block. Omitted entirely when the event hasn't happened — an empty
  // "Date:" label under an unsigned block reads as missing data rather than not-yet.
  const signDate = (d?: string | null) =>
    d ? `<div class="sign-date">${esc(new Date(d).toLocaleDateString())}</div>` : '';
  const css = `
    /* #6 — project/date-filed/needed-by stacked on the left, PR No. right-aligned. */
    .meta { display:flex; justify-content:space-between; align-items:flex-start; margin:14px 0; font-size:10pt; }
    .meta-left div { margin-bottom:2px; }
    .meta span { font-weight:bold; }
    .meta-right { text-align:right; }
    table.items { width:100%; border-collapse:collapse; margin-top:6px; font-size:10pt; }
    table.items th, table.items td { border:1px solid #000; padding:5px 6px; }
    table.items th { background:#f0f0f0; }
    .total { text-align:right; font-weight:bold; margin-top:8px; font-size:11pt; }
    .cert { margin:22px 0 10px; font-size:10.5pt; line-height:1.5; }
    /* Three blocks across: Prepared By | Accounting | Approved By. They share the width
       (flex:1) rather than taking a fixed 280px each — 3 × 280 overflows the A4 text column.
       break-inside avoids a page split that would strand a signature from its name. */
    .sign-row { display:flex; gap:20px; margin-top:26px; break-inside:avoid; }
    .sign-wrap { flex:1; min-width:0; }
    .sign-line { border-bottom:1px solid #000; }
    .sign-name { font-weight:bold; margin-top:3px; font-size:10pt; overflow-wrap:break-word; }
    .sign-role { font-size:9pt; }
    .sign-date { font-size:8.5pt; color:#333; margin-top:1px; }
`;
  const body = `
    <div class="meta">
      <div class="meta-left">
        <div><span>For (Project):</span> ${esc(pr.projectName || 'Personal use')}</div>
        <div><span>Requested Date:</span> ${esc(pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—')}</div>
        <div><span>Required Date:</span> ${esc(pr.neededBy ? new Date(pr.neededBy).toLocaleDateString() : '—')}</div>
      </div>
      <div class="meta-right"><span>PR No.:</span> ${esc(pr.prNumber)}</div>
    </div>
    <div class="document-title" style="margin:12px auto 4px">PURCHASE REQUEST REVIEW</div>
    <table class="items">
      <thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Unit</th><th>Est. Cost</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">Total: ${peso(pr.total)}</div>
    ${pr.notes ? `<div class="cert"><span style="font-weight:bold">Notes:</span> ${esc(pr.notes)}</div>` : ''}
    <div class="cert">
      This certifies that the purchase request above has been <b>reviewed and checked by Accounting</b> on ${esc(checkedDate)}${pr.verifiedBy ? ` and <b>approved by ${esc(pr.verifiedBy)}</b> on ${esc(verifiedDate)}` : ''}.
    </div>
    <div class="sign-row">
      <div class="sign-wrap">
        ${sigImg(preparedSignature)}
        <div class="sign-line"></div>
        <div class="sign-name">${esc(pr.employeeName || '—')}</div>
        <div class="sign-role">Prepared By</div>
        ${signDate(pr.createdAt)}
      </div>
      <div class="sign-wrap">
        ${sigImg(checkedSignature)}
        <div class="sign-line"></div>
        <div class="sign-name">${esc(pr.checkedBy || 'Accounting')}</div>
        <div class="sign-role">Reviewed By</div>
        ${signDate(pr.checkedAt)}
      </div>
      <div class="sign-wrap">
        ${sigImg(approvedSignature)}
        <div class="sign-line"></div>
        <div class="sign-name">${esc(pr.verifiedBy || '—')}</div>
        <div class="sign-role">Approved By</div>
        ${signDate(pr.verifiedAt)}
      </div>
    </div>`;
  const html = renderPrintDocument({
    title: `PR Review Report ${pr.prNumber}`,
    docTitle: '',
    css,
    body,
  });
  // open() resets the document — without it, write() would append the report onto the
  // "Preparing…" placeholder instead of replacing it.
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { w.print(); };
}

// ============================================================================
// Signature pad (draw or upload) — saved as a data-URL to the accounting account
// ============================================================================
function SignaturePad({ initial, onSaved }: { initial: string | null; onSaved: (sig: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const ctx = () => canvasRef.current?.getContext('2d') || null;

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000000';
    if (initial) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, c.width, c.height); img.src = initial; }
  }, [initial]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };
  const down = (e: React.PointerEvent) => { const g = ctx(); if (!g) return; drawing.current = true; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const g = ctx(); if (!g) return; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); setDirty(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current; const g = ctx(); if (c && g) g.clearRect(0, 0, c.width, c.height); setDirty(true); };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { toast.error('Upload a PNG or JPEG image'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const c = canvasRef.current; const g = ctx(); if (!c || !g) return;
      const img = new Image();
      img.onload = () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); setDirty(true); };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const save = async () => {
    const c = canvasRef.current; if (!c) return;
    const data = c.toDataURL('image/png');
    setSaving(true);
    try {
      const res = await aFetch<{ signature: string }>('/accounting/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      onSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">My e-signature</h2>
        <p className="text-sm text-gray-500 mt-0.5">This signature is stamped on every purchase request you mark as reviewed. Draw below or upload an image.</p>
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white">
          <canvas ref={canvasRef} width={560} height={200} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="w-full touch-none rounded-lg" style={{ height: 200, cursor: 'crosshair' }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={clear} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"><Eraser className="w-4 h-4" /> Clear</button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" /> Upload image
            <input type="file" accept="image/png,image/jpeg" onChange={onUpload} className="hidden" />
          </label>
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors ml-auto">{saving ? 'Saving…' : 'Save signature'}</button>
        </div>
      </div>
      {initial && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Currently saved</h3>
          <img src={initial} alt="Saved signature" className="max-h-24 object-contain border border-gray-100 rounded bg-white" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PR detail modal
// ============================================================================
const Meta = ({ label, value }: { label: string; value: any }) => (
  <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-900">{value ?? '—'}</div></div>
);

function DetailModal({ pr, busy, onReview, onReject, onPrint, onClose }: {
  pr: PurchaseRequest; busy: boolean;
  onReview: (pr: PurchaseRequest) => void; onReject: (pr: PurchaseRequest) => void;
  onPrint: (pr: PurchaseRequest) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-900">{pr.prNumber}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{pr.employeeName || 'Employee'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Meta label="Status" value={<span className={`text-xs font-semibold ${statusPill(pr.status)}`}>{statusLabel(pr.status)}</span>} />
            <Meta label="For (Project)" value={pr.projectName || 'Personal use'} />
            <Meta label="Prepared by" value={pr.employeeName} />
            <Meta label="Requested Date" value={pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—'} />
            <Meta label="Required Date" value={pr.neededBy ? new Date(pr.neededBy).toLocaleDateString() : '—'} />
            <Meta label="Reviewed by (Accounting)" value={pr.checkedBy} />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Items</div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-gray-700 text-xs uppercase">
                  <th className="text-left font-medium px-3 py-2">Description</th>
                  <th className="text-left font-medium px-3 py-2 w-16">Qty</th>
                  <th className="text-left font-medium px-3 py-2 w-20">Unit</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Est. Cost</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {pr.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-900">{it.description}</td>
                      <td className="px-3 py-2 text-gray-500">{it.quantity}</td>
                      <td className="px-3 py-2 text-gray-500">{it.unit}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{peso(it.unitCost)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{peso(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right font-bold text-gray-900 mt-2">Total: {peso(pr.total)}</div>
          </div>
          {pr.notes && <div><div className="text-xs text-gray-400 mb-1">Notes</div><p className="text-sm text-gray-700">{pr.notes}</p></div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          {pr.status === 'pending' ? (
            <>
              <button onClick={() => onReject(pr)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><XCircle className="w-4 h-4" /> Reject</button>
              <button onClick={() => onReview(pr)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><CheckCircle2 className="w-4 h-4" /> Confirm Reviewed</button>
            </>
          ) : (
            <>
              <button onClick={() => onPrint(pr)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-4 h-4" /> Print</button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The basis picker that sits beside every entered price. Deliberately a plain <select> rather than
// a segmented toggle: three options with real consequences read better as a named list, and the
// helper line below restates the chosen one in words so the basis can never be picked by accident.
function VatBasisField({ value, onChange, idSuffix }: { value: VatBasis; onChange: (v: VatBasis) => void; idSuffix: string }) {
  const chosen = VAT_BASIS_OPTIONS.find(o => o.value === value) ?? VAT_BASIS_OPTIONS[0];
  return (
    <div>
      <label htmlFor={`vat-basis-${idSuffix}`} className="block text-sm font-medium text-gray-700 mb-1 leading-5 min-h-[2.5rem]">
        Price is
      </label>
      <select
        id={`vat-basis-${idSuffix}`}
        value={value}
        onChange={e => onChange(e.target.value as VatBasis)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {VAT_BASIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="mt-1 text-xs text-gray-400">{chosen.hint}</p>
    </div>
  );
}

// ============================================================================
// Project modal — the full project record (mirrors the admin Projects tab)
// ============================================================================
function ProjectModal({ initial, onClose, onSaved }: { initial: Project | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name || '', description: initial?.description || '', status: initial?.status || 'Active',
    location: initial?.location || '',
    startDate: (initial?.startDate || '').slice(0, 10), endDate: (initial?.endDate || '').slice(0, 10),
    contractPrice: initial?.contractPrice != null ? String(initial.contractPrice) : '',
    // Defaults to VAT-inclusive, the common case and the basis every pre-existing priced row was
    // backfilled to. An existing project keeps whatever it already carries.
    contractPriceVat: (initial?.contractPriceVat ?? 'inclusive') as VatBasis,
    netProfitPercent: initial?.netProfitPercent != null ? String(initial.netProfitPercent) : '',
    budgetAllocation: initial?.budgetAllocation != null ? String(initial.budgetAllocation) : '',
    // Which of the linked pair the user typed last, so re-typing Contract Price re-derives
    // the correct dependent field. Defaults to 'np' (Net Profit % drives Budget).
    lastEdited: 'np',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  // Net Profit % and Budget Allocation are BOTH typeable and two-way linked. Whichever the user
  // types last drives the other; both need a Contract Price first (guarded against divide-by-zero):
  //   type Net Profit %  → Budget       = Contract × (1 − NetProfit% / 100)
  //   type Budget        → Net Profit % = (1 − Budget / Contract) × 100
  // Re-typing Contract Price re-derives whichever field was NOT typed last.
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const setContract = (v: string) => setF(p => {
    const cp = parseFloat(v);
    const next = { ...p, contractPrice: v };
    if (Number.isFinite(cp) && cp > 0) {
      if (p.lastEdited === 'budget') {
        const bud = parseFloat(p.budgetAllocation);
        if (Number.isFinite(bud)) next.netProfitPercent = String(round2((1 - bud / cp) * 100));
      } else {
        const np = parseFloat(p.netProfitPercent);
        if (Number.isFinite(np)) next.budgetAllocation = String(round2(cp * (1 - np / 100)));
      }
    }
    return next;
  });

  const setNetProfit = (v: string) => setF(p => {
    const next = { ...p, netProfitPercent: v, lastEdited: 'np' };
    const cp = parseFloat(p.contractPrice);
    const np = parseFloat(v);
    if (Number.isFinite(cp) && cp > 0 && Number.isFinite(np)) next.budgetAllocation = String(round2(cp * (1 - np / 100)));
    return next;
  });

  const setBudget = (v: string) => setF(p => {
    const next = { ...p, budgetAllocation: v, lastEdited: 'budget' };
    const cp = parseFloat(p.contractPrice);
    const bud = parseFloat(v);
    if (Number.isFinite(cp) && cp > 0 && Number.isFinite(bud)) next.netProfitPercent = String(round2((1 - bud / cp) * 100));
    return next;
  });

  const save = async () => {
    if (!f.name.trim()) { toast.error('Client name is required'); return; }
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(), description: f.description.trim() || null, status: f.status,
        location: f.location.trim() || null,
        startDate: f.startDate || null, endDate: f.endDate || null,
        budgetAllocation: f.budgetAllocation === '' ? null : Number(f.budgetAllocation),
        contractPrice: f.contractPrice === '' ? null : Number(f.contractPrice),
        contractPriceVat: f.contractPriceVat,
        netProfitPercent: f.netProfitPercent === '' ? null : Number(f.netProfitPercent),
      };
      if (initial) await aFetch(`/projects/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await aFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Project updated' : 'Project created');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  // Grid-field label: reserves a consistent two-line height so a wrapping label (e.g.
  // "Contract Price (₱)") and a single-line one both start their input on the same line.
  // Paired with items-start on the grid, this keeps every row's inputs level regardless of
  // label wrapping or helper text below a field.
  const flabel = 'block text-sm font-medium text-gray-700 mb-1 leading-5 min-h-[2.5rem]';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{initial ? 'Edit Project' : 'New Project'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name <span className="text-red-500">*</span></label>
            <input value={f.name} onChange={e => set('name', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Description</label>
            <textarea value={f.description} onChange={e => set('description', e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
          {/* items-start top-aligns every field and each label reserves a fixed two-line height
              (flabel), so inputs in a row start on the same line even when one label wraps.
              Helper text sits below its input and can't push a sibling out of line. */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div>
              <label className={flabel}>Contract Price (₱)</label>
              <input type="number" min="0" step="0.01" value={f.contractPrice} onChange={e => setContract(e.target.value)} placeholder="0.00" className={input} />
            </div>
            <VatBasisField value={f.contractPriceVat} idSuffix="project" onChange={v => setF(p => ({ ...p, contractPriceVat: v }))} />
            <div>
              <label className={flabel}>Net Profit %</label>
              <input type="number" min="0" max="100" step="0.01" value={f.netProfitPercent} onChange={e => setNetProfit(e.target.value)} placeholder="e.g. 30" className={input} />
            </div>
            <div className="col-span-2">
              <label className={flabel}>Budget Allocation (₱)</label>
              <input type="number" min="0" step="0.01" value={f.budgetAllocation} onChange={e => setBudget(e.target.value)} placeholder="0.00" className={input} />
              <p className="mt-1 text-xs text-gray-400">Linked to Net Profit %: enter one and the other fills. Budget = Contract × (1 − Net Profit% ÷ 100).</p>
            </div>
            <div>
              <label className={flabel}>Status</label>
              <select value={f.status} onChange={e => set('status', e.target.value)} className={`${input} bg-white`}>
                {statusOptionsFor(f.status).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={flabel}>Location</label>
              <input value={f.location} onChange={e => set('location', e.target.value)} className={input} />
            </div>
            <div>
              <label className={flabel}>Start date</label>
              <input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className={flabel}>End date</label>
              <input type="date" value={f.endDate} onChange={e => set('endDate', e.target.value)} className={input} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Facility modal — a facility is just a named category (optional description) that PRs can be
// tagged to. Budget/status/location columns still exist in the DB (so existing rows load) but are
// no longer shown or required here.
// ============================================================================
function FacilityModal({ initial, onClose, onSaved }: { initial: Facility | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name || '', description: initial?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast.error('Facility name is required'); return; }
    setSaving(true);
    try {
      // Only name + description are sent. On create the server applies its column defaults
      // (status 'Active', budget 0); on edit, omitted fields are left untouched.
      const body = { name: f.name.trim(), description: f.description.trim() || null };
      if (initial) await aFetch(`/facilities/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await aFetch('/facilities', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Facility updated' : 'Facility created');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  const flabel = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{initial ? 'Edit Facility' : 'New Facility'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className={flabel}>Facility Name <span className="text-red-500">*</span></label>
            <input value={f.name} onChange={e => set('name', e.target.value)} className={input} />
          </div>
          <div>
            <label className={flabel}>Description</label>
            <textarea value={f.description} onChange={e => set('description', e.target.value)} rows={3} className={`${input} resize-none`} placeholder="Optional — what this facility category is for" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// A target's expenses — the spend summary (from the server), every allocation line charged to it,
// and Void. Works for a project, a trading deal or a facility; only the stat strip differs, because
// a project has a budget to measure against and a trading has a selling price.
//
// Voiding keeps the rows (struck through, with who/why) so the money record is never lost; it just
// stops counting toward spend. A void reverses the WHOLE receipt, every split line of it at once —
// the confirmation says so explicitly when the receipt was split, because voiding from one project's
// screen also pulls the money off whatever else it was shared with.
// ============================================================================
function ExpensesModal({ target, stats, reloadKey, onClose, onLog, onChanged }: {
  target: TargetRef;
  stats: { label: string; value: string; tone?: string }[];
  reloadKey: number;
  onClose: () => void; onLog: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<ExpenseAllocation[] | null>(null);
  const [voiding, setVoiding] = useState<ExpenseAllocation | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setRows(await aFetch<ExpenseAllocation[]>(`/${TARGET_PATH[target.kind]}/${target.id}/expenses`)); }
    catch (e: any) { toast.error('Could not load expenses: ' + e.message); setRows([]); }
  };
  useEffect(() => { load(); }, [target.kind, target.id, reloadKey]);

  const confirmVoid = async () => {
    if (!voiding) return;
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setBusy(true);
    try {
      await aFetch(`/expenses/${voiding.expenseId}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      toast.success(`Expense of ${peso(voiding.expenseTotal)} voided`);
      setVoiding(null); setReason('');
      await load();
      onChanged();
    } catch (e: any) { toast.error('Void failed: ' + e.message); } finally { setBusy(false); }
  };

  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  // People type the reference either bare ("88121") or with the prefix ("OR 88121", "O.R. #88121");
  // normalise so it never reads "OR OR 88121". The lookahead keeps e.g. "ORD-551" intact.
  const refLabel = (r: string) => `OR ${r.replace(/^\s*o\.?\s*r\.?(?![a-z])\s*(no\.?|#)?\s*/i, '')}`;
  // The voucher number leads, because it is what ties this line to a piece of paper in a folder.
  // It belongs to the whole receipt, so on a split it is the SAME number on every line here.
  const meta = (x: ExpenseAllocation) => [x.serialNo, x.payee, x.referenceNo && refLabel(x.referenceNo)].filter(Boolean).join(' · ');
  // A split line shows ITS share as the amount, and says what the whole receipt was and how it was
  // divided — otherwise ₱600 against a ₱1,000 receipt looks like a data error.
  const splitNote = (x: ExpenseAllocation) => !x.isSplit ? null : (
    <div className="text-xs text-blue-700 mt-0.5 flex items-start gap-1">
      <Split className="w-3 h-3 mt-0.5 flex-shrink-0" />
      <span>{peso(x.amount)} of a {peso(x.expenseTotal)} receipt split {x.allocationCount} ways{x.targets ? ` — ${x.targets}` : ''}</span>
    </div>
  );
  const voidAction = (x: ExpenseAllocation) => x.voidedAt
    ? <span className="text-xs font-medium text-gray-400">Voided</span>
    : <button onClick={() => { setVoiding(x); setReason(''); }} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Ban className="w-3.5 h-3.5" /> Void</button>;
  // A flex-wrap strip, not a grid: professional-design-complete.css forces `.grid-cols-2` with
  // !important, which beats any sm:grid-cols-N and would pin this to two columns everywhere.
  const stat = (label: string, value: string, tone = 'text-gray-900') => (
    <div className="min-w-[7rem]" key={label}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-semibold ${tone} whitespace-nowrap`}>{value}</div>
    </div>
  );
  const KIND_LABEL: Record<TargetKind, string> = { project: 'project', trading: 'trading deal', facility: 'facility' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{target.name}</h3>
            <p className="text-xs text-gray-500">Direct expenses — costs that didn't go through a purchase request</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map(s => stat(s.label, s.value, s.tone))}
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{rows ? `${rows.length} record${rows.length === 1 ? '' : 's'}` : 'Loading…'}</span>
            <button onClick={onLog} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> New Voucher</button>
          </div>
          {rows && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400"><Receipt className="w-9 h-9 mb-2 text-gray-300" /><p className="text-sm">No expenses logged for this {KIND_LABEL[target.kind]} yet.</p></div>
          ) : rows && (
            <>
            {/* Phone: one card per expense, so the amount is always on screen (a table scrolls it away). */}
            <div className="sm:hidden space-y-2">
              {rows.map(x => {
                const voided = !!x.voidedAt;
                return (
                  <div key={x.allocationId} className={`border border-gray-200 rounded-xl p-3 ${voided ? 'bg-gray-50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={voided ? 'text-gray-400 line-through' : 'text-gray-900'}>{x.description}</div>
                        <div className="text-xs text-gray-400">{[fmtDate(x.expenseDate), meta(x)].filter(Boolean).join(' · ')}</div>
                        {splitNote(x)}
                      </div>
                      <div className={`whitespace-nowrap font-semibold ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{peso(x.amount)}</div>
                    </div>
                    {voided && <div className="text-xs text-red-600 mt-1">Voided by {x.voidedBy || 'unknown'}: {x.voidReason}</div>}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-500 truncate">Logged by {x.createdBy || '—'}</span>
                      {voidAction(x)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Description</th>
                      <th className="px-3 py-2.5 text-right">Charged here</th>
                      <th className="px-3 py-2.5">Logged by</th>
                      <th className="px-3 py-2.5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(x => {
                      const voided = !!x.voidedAt;
                      return (
                        <tr key={x.allocationId} className={`border-b border-gray-100 last:border-0 align-top ${voided ? 'bg-gray-50' : ''}`}>
                          <td className={`px-3 py-2.5 whitespace-nowrap ${voided ? 'text-gray-400' : 'text-gray-700'}`}>{fmtDate(x.expenseDate)}</td>
                          <td className="px-3 py-2.5 min-w-[14rem]">
                            <div className={voided ? 'text-gray-400 line-through' : 'text-gray-900'}>{x.description}</div>
                            {meta(x) && <div className="text-xs text-gray-400">{meta(x)}</div>}
                            {splitNote(x)}
                            {voided && (
                              <div className="text-xs text-red-600 mt-0.5">Voided by {x.voidedBy || 'unknown'}: {x.voidReason}</div>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{peso(x.amount)}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{x.createdBy || '—'}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{voidAction(x)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {voiding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(() => setVoiding(null))}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">Void this expense?</h3>
              <p className="mt-1 text-sm text-gray-500">{peso(voiding.expenseTotal)} — {voiding.description}</p>
            </div>
            <div className="p-5 space-y-2">
              {voiding.isSplit && (
                <div className="flex items-start gap-2 p-3 mb-1 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <Split className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>This receipt is split {voiding.allocationCount} ways{voiding.targets ? ` (${voiding.targets})` : ''}. Voiding it removes the money from <strong>all</strong> of them, not just this one.</span>
                </div>
              )}
              {(voiding.poPaymentCount ?? 0) > 0 && (
                <div className="flex items-start gap-2 p-3 mb-1 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <span>This voucher also pays {voiding.poPaymentCount} purchase order{voiding.poPaymentCount === 1 ? '' : 's'}. Voiding it reverses those payments too — each PO goes back to <strong>owing</strong> what was paid.</span>
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
              <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
                placeholder="e.g. Duplicate — already logged under OR 88120"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <p className="text-xs text-gray-400">The record stays on file, struck through, and stops counting toward spend.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setVoiding(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={confirmVoid} disabled={busy || !reason.trim()} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{busy ? 'Voiding…' : 'Void expense'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// New / Edit a trading deal. Name is all that's required; a selling price is optional and only
// exists so the Trading Deals table can show margin. No budget field — see the Trading interface.
// ============================================================================
function TradingModal({ trading, onClose, onSaved }: {
  trading: Trading | null; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: trading?.name ?? '', client: trading?.client ?? '',
    status: trading?.status ?? 'Active',
    sellingPrice: trading?.sellingPrice != null ? String(trading.sellingPrice) : '',
  });
  const [saving, setSaving] = useState(false);
  // The basis of the selling price. Defaults to VAT-inclusive, which is both the common case and
  // the basis every already-priced deal was backfilled to.
  const [vat, setVat] = useState<VatBasis>(trading?.sellingPriceVat ?? 'inclusive');
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast.error('Name is required'); return; }
    const price = f.sellingPrice.replace(/,/g, '').trim();
    if (price && (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) < 0)) { toast.error('Selling price must be a peso amount, or left blank'); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({
        name: f.name.trim(), client: f.client.trim() || null,
        status: f.status, sellingPrice: price === '' ? null : price,
        sellingPriceVat: vat,
      });
      if (trading) await aFetch(`/tradings/${trading.id}`, { method: 'PATCH', body });
      else await aFetch('/tradings', { method: 'POST', body });
      toast.success(trading ? 'Trading updated' : 'Trading created');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{trading ? 'Edit Trading Deal' : 'New Trading Deal'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className={label}>Name <span className="text-red-500">*</span></label>
            <input autoFocus value={f.name} onChange={e => set('name', e.target.value)} maxLength={200}
              placeholder="e.g. Air pumps — RESUN ACO-012 for NHK" className={input} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Client <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={f.client} onChange={e => set('client', e.target.value)} maxLength={200} className={input} />
            </div>
            <div>
              <label className={label}>Status</label>
              <select value={f.status} onChange={e => set('status', e.target.value)} className={`${input} bg-white`}>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label className={label}>Selling price (₱) <span className="text-gray-400 font-normal">(optional)</span></label>
              <input inputMode="decimal" value={f.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} placeholder="0.00" className={input} />
              <p className="mt-1 text-xs text-gray-400">Type it exactly as quoted. Leave blank to just accumulate cost.</p>
            </div>
            {/* The basis is what makes the price mean something: the same 26,940 is two different
                revenues depending on whether VAT is already in it. */}
            <VatBasisField value={vat} idSuffix="trading" onChange={setVat} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : trading ? 'Save changes' : 'Create trading'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Portal shell
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('requests');
  // Sidebar preferences (minimized strip + which groups are open), remembered per browser. Loading
  // and saving are wrapped, so the menu works with storage unavailable — it just forgets.
  const [navPrefs, setNavPrefs] = useState<NavPrefs>(() => loadNavPrefs());
  const collapsed = navPrefs.minimized;
  const setCollapsed = (v: boolean) => setNavPrefs(p => setMinimized(p, v));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | PRStatus>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [poAlloc, setPoAlloc] = useState('');
  // The invoice the Collections Report sent us to (opened inside Receivables); cleared on any menu click.
  const [receivablesFocus, setReceivablesFocus] = useState<number | null>(null);
  const [viewing, setViewing] = useState<PurchaseRequest | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [tradings, setTradings] = useState<Trading[]>([]);
  const [editingTrading, setEditingTrading] = useState<Trading | null>(null);
  const [showTradingModal, setShowTradingModal] = useState(false);
  // Spend per project/trading/facility, straight from the server. null = couldn't load → shown as
  // "—", never as a misleading ₱0.00.
  const [projectSpend, setProjectSpend] = useState<Record<string, ProjectSpend> | null>(null);
  const [rollup, setRollup] = useState<ProfitRollup | null>(null);
  const [tradingSpend, setTradingSpend] = useState<Record<string, TradingSpend> | null>(null);
  const [facilitySpend, setFacilitySpend] = useState<Record<string, FacilitySpend> | null>(null);
  // `target: null` inside the object means "open, nothing pre-selected".
  // The Disbursement Voucher form (it replaced Log Expense). `target` pre-points the first expense line
  // (opened from a project/trading/facility); `poId` pre-loads a PO line (opened from the Payable Report).
  const [logExpense, setLogExpense] = useState<{ target: TargetRef | null; poId?: string } | null>(null);
  const [expensesFor, setExpensesFor] = useState<TargetRef | null>(null);
  const [expensesReload, setExpensesReload] = useState(0);
  // How many invoices are overdue (outstanding balance past their collection date). The server
  // derives `overdue` per invoice from the payment rows, so this is a live count of real state —
  // nothing is stored, and logging a payment clears it on the next load.
  const [overdueInvoiceCount, setOverdueInvoiceCount] = useState(0);

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [prs, pos, prj, fac, trd, sig, pSpend, fSpend, tSpend, roll, bis] = await Promise.all([
        aFetch<PurchaseRequest[]>('/purchase-requests'),
        aFetch<PurchaseOrder[]>('/purchase-orders').catch(() => [] as PurchaseOrder[]),
        aFetch<Project[]>('/projects'),
        aFetch<Facility[]>('/facilities').catch(() => [] as Facility[]),
        aFetch<Trading[]>('/tradings').catch(() => [] as Trading[]),
        aFetch<{ signature: string | null }>('/accounting/signature').catch(() => ({ signature: null })),
        aFetch<ProjectSpend[]>('/projects/spend').catch(() => null),
        aFetch<FacilitySpend[]>('/facilities/spend').catch(() => null),
        aFetch<TradingSpend[]>('/tradings/spend').catch(() => null),
        // An older server without the roll-up just leaves the total row out rather than failing
        // the page, the same tolerance /tradings/spend already gets here.
        aFetch<ProfitRollup>('/profit-rollup').catch(() => null),
        aFetch<{ overdue?: boolean; voidedAt?: string | null }[]>('/billing-invoices').catch(() => []),
      ]);
      setProjectSpend(pSpend ? Object.fromEntries(pSpend.map(s => [s.projectId, s])) : null);
      setFacilitySpend(fSpend ? Object.fromEntries(fSpend.map(s => [s.facilityId, s])) : null);
      setTradingSpend(tSpend ? Object.fromEntries(tSpend.map(s => [s.tradingId, s])) : null);
      setRollup(roll ?? null);
      setTradings(trd || []);
      setRequests(prs || []);
      // Only real purchase orders (the table is shared with Sales Orders, discriminated by
      // order_type — accounting reviews purchases, not sales).
      setOrders((pos || []).filter(o => (o as any).orderType !== 'sales'));
      setProjects(prj || []);
      setFacilities(fac || []);
      setSignature(sig?.signature || null);
      setOverdueInvoiceCount((bis || []).filter(b => b.overdue && !b.voidedAt).length);
    } catch (e: any) {
      if (!silent) toast.error(e.message || 'Failed to load data');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  // Paused while a review is in flight or a project/facility modal is open.
  useLiveRefresh(() => loadAll({ silent: true }), { enabled: !busyId && !showProjectModal && !editingProject && !showFacilityModal && !editingFacility && !showTradingModal && !editingTrading && !logExpense && !expensesFor });

  const review = async (pr: PurchaseRequest) => {
    if (!(await confirmDialog({ title: `Confirm you have reviewed ${pr.prNumber}?`, message: 'Your e-signature is attached and it moves to Purchasing to raise a purchase order.', confirmLabel: 'Confirm review' }))) return;
    setBusyId(pr.id);
    try {
      const updated = await aFetch<PurchaseRequest>(`/purchase-requests/${pr.id}/accounting-review`, { method: 'PUT', body: JSON.stringify({ action: 'reviewed' }) });
      setRequests(prev => prev.map(r => r.id === pr.id ? { ...r, ...updated } : r));
      setViewing(null);
      toast.success('Request reviewed');
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusyId(''); }
  };

  const reject = async (pr: PurchaseRequest) => {
    if (!(await confirmDialog({ title: `Reject ${pr.prNumber}?`, message: 'The employee will see it as disapproved.', confirmLabel: 'Reject', tone: 'danger' }))) return;
    setBusyId(pr.id);
    try {
      const updated = await aFetch<PurchaseRequest>(`/purchase-requests/${pr.id}/accounting-review`, { method: 'PUT', body: JSON.stringify({ action: 'rejected' }) });
      setRequests(prev => prev.map(r => r.id === pr.id ? { ...r, ...updated } : r));
      setViewing(null);
      toast.success('Request rejected');
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusyId(''); }
  };

  // Section C — #12: Accounting's review of a raised purchase order — the FIRST of its two gates.
  const reviewOrder = async (po: PurchaseOrder, status: 'approved' | 'rejected') => {
    const ok = status === 'approved'
      ? await confirmDialog({ title: `Pass ${po.poNumber} to Admin?`, message: 'Your review is recorded and the order moves to Admin for final approval.', confirmLabel: 'Approve' })
      : await confirmDialog({ title: `Reject ${po.poNumber}?`, message: 'It goes back to Purchasing to revise and resubmit.', confirmLabel: 'Reject', tone: 'danger' });
    if (!ok) return;
    setBusyId(po.id);
    try {
      await aFetch(`/purchase-orders/${po.id}/accounting-review`, { method: 'PUT', body: JSON.stringify({ status }) });
      toast.success(status === 'approved' ? 'Order reviewed — sent to Admin' : 'Order rejected');
      loadAll({ silent: true });
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusyId(''); }
  };

  const printOrder = async (po: PurchaseOrder) => {
    const r = await printPurchaseOrder(po as any, () => aFetch(`/purchase-orders/${po.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  const deleteProject = async (p: Project) => {
    if (!(await confirmDialog({ title: `Delete project "${p.name}"?`, message: 'Purchase requests that referenced it will show as "Personal use".', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = projects; setProjects(projects.filter(x => x.id !== p.id));
    try { await aFetch(`/projects/${p.id}`, { method: 'DELETE' }); toast.success('Project deleted'); }
    catch (e: any) { setProjects(prev); toast.error('Delete failed: ' + e.message); }
  };

  // The two dual-basis tables. Built by mapping the server's own figures into the shared panel's
  // shape — no arithmetic, just field selection, so the panel and the bars cannot disagree with the
  // numbers the endpoints returned.
  const tradingBasisRows: DualBasisRow[] = tradings.map(t => {
    const s = tradingSpend?.[t.id] ?? null;
    const zero: BasisFigures = { revenue: null, cost: 0, costPrs: 0, costExpenses: 0, profit: null, marginPercent: null };
    return {
      id: t.id, name: t.name, subtitle: t.client ?? null,
      price: s ? s.sellingPrice : t.sellingPrice ?? null,
      priceBasis: s ? s.sellingPriceVat : t.sellingPriceVat ?? 'inclusive',
      exVat: s ? s.exVat : zero, incVat: s ? s.incVat : zero,
    };
  });
  const projectBasisRows: DualBasisRow[] = projects.map(p => {
    const s = projectSpend?.[p.id] ?? null;
    const zero: BasisFigures = { revenue: null, cost: 0, costPrs: 0, costExpenses: 0, profit: null, marginPercent: null };
    return {
      id: p.id, name: p.name, subtitle: p.location ?? null,
      price: s ? s.contractPrice : p.contractPrice ?? null,
      priceBasis: s ? s.contractPriceVat : p.contractPriceVat ?? 'inclusive',
      exVat: s ? s.exVat : zero, incVat: s ? s.incVat : zero,
    };
  });
  // The bars read the same payload the panel does, one strip per basis.
  const tradingBarRows = tradings.map(t => {
    const s = tradingSpend?.[t.id] ?? null;
    return {
      id: t.id, tradingId: t.id, name: t.name, client: t.client, status: t.status,
      spent: s ? s.spent : 0, spentPrs: s ? s.spentPrs : 0, spentExpenses: s ? s.spentExpenses : 0,
      sellingPrice: s ? s.sellingPrice : t.sellingPrice ?? null,
      margin: s ? s.margin : null, marginPercent: s ? s.marginPercent : null,
      exVat: s ? s.exVat : undefined, incVat: s ? s.incVat : undefined,
    };
  });
  const projectBarRows = projects.map(p => {
    const s = projectSpend?.[p.id] ?? null;
    return {
      id: p.id, name: p.name, client: p.location, status: p.status,
      spent: s ? s.spent : 0, spentPrs: s ? s.spentPrs : 0, spentExpenses: s ? s.spentExpenses : 0,
      sellingPrice: s ? s.contractPrice : p.contractPrice ?? null,
      margin: null, marginPercent: null,
      exVat: s ? s.exVat : undefined, incVat: s ? s.incVat : undefined,
    };
  });

  // The stat strip above a target's expense list. Each target type measures itself differently: a
  // project against its budget, a trading against its selling price (margin), a facility against
  // nothing at all — so the strip is built per kind rather than pretending they share a shape.
  const expenseStats = (t: TargetRef): { label: string; value: string; tone?: string }[] => {
    if (t.kind === 'project') {
      const s = projectSpend?.[t.id] ?? null;
      return [
        { label: 'Budget', value: s ? peso(s.budget) : '—' },
        { label: 'Purchased', value: s ? peso(s.spentPrs) : '—' },
        { label: 'Expenses', value: s ? peso(s.spentExpenses) : '—' },
        { label: 'Total spent', value: s ? peso(s.spent) : '—' },
        s && s.overBudget > 0
          ? { label: 'Over budget', value: peso(s.overBudget), tone: 'text-red-600' }
          : { label: 'Remaining', value: s ? peso(s.remaining) : '—' },
      ];
    }
    if (t.kind === 'trading') {
      const s = tradingSpend?.[t.id] ?? null;
      return [
        { label: 'Purchased', value: s ? peso(s.spentPrs) : '—' },
        { label: 'Expenses', value: s ? peso(s.spentExpenses) : '—' },
        { label: 'Total cost', value: s ? peso(s.spent) : '—' },
        { label: 'Selling price', value: s && s.sellingPrice != null ? peso(s.sellingPrice) : '—' },
        { label: 'Margin', value: s && s.margin !== null ? peso(s.margin) : '—',
          tone: s && s.margin !== null && s.margin < 0 ? 'text-red-600' : 'text-emerald-700' },
      ];
    }
    const s = facilitySpend?.[t.id] ?? null;
    return [
      { label: 'Purchased', value: s ? peso(s.spentPrs) : '—' },
      { label: 'Expenses', value: s ? peso(s.spentExpenses) : '—' },
      { label: 'Total spent', value: s ? peso(s.spent) : '—' },
    ];
  };

  // A trading carrying PRs or expense allocations is refused by the server (409) — the same
  // protection projects have. Retire it by setting its status to Completed instead.
  const deleteTrading = async (t: Trading) => {
    if (!(await confirmDialog({ title: `Delete "${t.name}"?`, message: 'This cannot be undone. A trading with purchase requests or expenses on it cannot be deleted.', confirmLabel: 'Delete trading', danger: true }))) return;
    try { await aFetch(`/tradings/${t.id}`, { method: 'DELETE' }); toast.success('Trading deleted'); loadAll(); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };
  const deleteFacility = async (f: Facility) => {
    if (!(await confirmDialog({ title: `Delete facility "${f.name}"?`, message: 'Purchase requests that referenced it will show as "Personal use".', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = facilities; setFacilities(facilities.filter(x => x.id !== f.id));
    try { await aFetch(`/facilities/${f.id}`, { method: 'DELETE' }); toast.success('Facility deleted'); }
    catch (e: any) { setFacilities(prev); toast.error('Delete failed: ' + e.message); }
  };

  const filtered = useMemo(() => requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || r.prNumber.toLowerCase().includes(q) || (r.employeeName || '').toLowerCase().includes(q) || (r.projectName || '').toLowerCase().includes(q);
  }), [requests, statusFilter, search]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const pendingOrderCount = orders.filter(o => o.status === 'pending').length;
  const shownOrders = useMemo(() => orders.filter(o => matchesAllocation(o, poAlloc)), [orders, poAlloc]);

  // Everything an expense can be charged to, for the history view's "Charged to" filter. Built from
  // the lists already loaded rather than a fresh fetch, so the picker and the rest of the portal
  // can never disagree about what exists.
  const expenseTargets: TargetOption[] = useMemo(() => [
    ...projects.map(p => ({ kind: 'project' as const, id: p.id, name: p.name })),
    ...tradings.map(t => ({ kind: 'trading' as const, id: t.id, name: t.name })),
    ...facilities.map(f => ({ kind: 'facility' as const, id: f.id, name: f.name })),
  ], [projects, tradings, facilities]);

  // ---- Sidebar. The grouped nav is AccountingSidebarNav; this is only its state.
  // The mobile drawer is never icon-only: a 'minimized' saved on a desktop must not turn the phone
  // menu into a column of bare icons.
  const mini = collapsed && !mobileOpen;
  const toggleGroup = (groupId: string) => setNavPrefs(p => toggleGroupPrefs(p, groupId, view));
  // Landing in a screen (a click, or the attention card jumping to Receivables) opens its group, so
  // the active screen is never hidden inside a collapsed one.
  useEffect(() => { setNavPrefs(p => revealGroupFor(p, view)); }, [view]);
  useEffect(() => { saveNavPrefs(navPrefs); }, [navPrefs]);

  const sidebar = (
    <div className="bg-white flex flex-col h-full border-r border-gray-200">
      <div className="border-b border-gray-200">
        <div className={`flex items-center gap-2 px-3 py-3 ${mini ? 'justify-center' : ''}`}>
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0">
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {!mini && <span className="text-sm font-semibold tracking-wide text-gray-500">Accounting</span>}
        </div>
        <div className={`flex justify-center ${mini ? 'px-2 pt-2 pb-3' : 'px-5 pt-4 pb-4'}`}>
          <img src="/kimoel-logo.png" alt="Logo" className={`${mini ? 'h-10' : 'h-32'} w-auto object-contain transition-all duration-200`} />
        </div>
      </div>
      <AccountingNav
        activeView={view} minimized={mini} prefs={navPrefs}
        badges={{ requests: pendingCount, orders: pendingOrderCount, receivables: overdueInvoiceCount }}
        onNavigate={(v) => { setReceivablesFocus(null); setView(v); setMobileOpen(false); }}
        onToggleGroup={toggleGroup} />
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <div className={`flex items-center gap-3 px-3 py-2 ${mini ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{(session.full_name || '?').charAt(0).toUpperCase()}</span></div>
          {!mini && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{session.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{session.email}</p>
            </div>
          )}
        </div>
        <button onClick={onSignOut} title="Sign out" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 ${mini ? 'justify-center' : ''}`}>
          <LogOut className="w-4 h-4 flex-shrink-0" />{!mini && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AttentionCard items={[
        { label: 'Requests to review', count: pendingCount, onView: () => setView('requests') },
        { label: 'Orders to review', count: pendingOrderCount, onView: () => setView('orders') },
        // Overdue receivables. A live count off the invoice rows (balance outstanding past its
        // collection date), not a stored notification — so it clears the moment a payment is logged.
        { label: 'Overdue invoices', count: overdueInvoiceCount, onView: () => setView('receivables') },
      ]} />
      <div className={`flex-shrink-0 w-72 z-30 lg:relative lg:flex lg:flex-col transition-all duration-200 ${collapsed ? 'lg:w-20' : 'lg:w-72'} ${mobileOpen ? 'fixed inset-y-0 left-0 flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>{sidebar}</div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between bg-white border-b border-gray-200 px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {view === 'signature' && <SignaturePad initial={signature} onSaved={setSignature} />}

          {view === 'expenses' && (
            <ExpensesHistory api={aFetch} targets={expenseTargets} isAdmin reloadKey={expensesReload}
              onNewVoucher={() => setLogExpense({ target: null })}
              onChanged={() => loadAll({ silent: true })} />
          )}

          {view === 'payables' && (
            <PayableReport api={aFetch} isAdmin reloadKey={expensesReload}
              onPay={(poId) => setLogExpense({ target: null, poId })} />
          )}

          {view === 'withdrawals' && <WithdrawalTab fetchFn={aFetch} />}

          {view === 'clients' && <CustomersList isAdmin api={aFetch} />}

          {view === 'delivery-receipts' && <DeliveryReceipts api={aFetch} isAdmin />}

          {view === 'billing-invoices' && <BillingInvoices api={aFetch} isAdmin />}

          {view === 'receivables' && <Receivables key={receivablesFocus ?? 'all'} api={aFetch} isAdmin focusId={receivablesFocus} />}

          {view === 'collections' && <CollectionsReport api={aFetch} isAdmin onOpenInvoice={(id) => { setReceivablesFocus(id); setView('receivables'); }} />}

          {view === 'timesheet' && <TimesheetReview api={aFetch} role="accounting" />}

          {view === 'payroll' && <PayrollReview api={aFetch} role="accounting" />}

          {view === 'projects' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Project Allocation</h2>
                  <p className="text-sm text-gray-500">Project master data — these appear in the employee's "For (Project)" picker. Spent is approved &amp; ordered purchase requests plus the direct expenses logged here.</p>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <button onClick={() => setLogExpense({ target: null })} disabled={projects.length === 0 && tradings.length === 0 && facilities.length === 0} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><Receipt className="w-4 h-4" /> New Voucher</button>
                  <button onClick={() => { setEditingProject(null); setShowProjectModal(true); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Project</button>
                </div>
              </div>
              {/* PROFIT on both VAT bases, above the budget table: the budget answers "is this
                  overrunning its allowance", this answers "did it make money", and they measure
                  against different numbers. Same panel the Trading Deals tab renders. */}
              {!loading && projects.length > 0 && (
                <>
                  <DualBasisProfit rows={projectBasisRows} totals={rollup?.projects ?? null} label="project" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <TradingProfitBars rows={projectBarRows} basis="exVat" title="Project profit" />
                    <TradingProfitBars rows={projectBarRows} basis="incVat" title="Project profit" />
                  </div>
                </>
              )}
              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Briefcase className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No projects yet</p></div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            <th className="px-4 py-3">Project</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Timeline</th>
                            <th className="px-4 py-3 text-right">Budget</th>
                            <th className="px-4 py-3 text-right">Spent</th>
                            <th className="px-4 py-3 text-right">Remaining</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.map(p => {
                            const s = projectSpend?.[p.id];
                            return (
                            <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{p.name}</div>
                                {p.location && <div className="text-xs text-gray-400">{p.location}</div>}
                              </td>
                              <td className="px-4 py-3"><span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200">{p.status || 'Active'}</span></td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {p.startDate ? new Date(p.startDate).toLocaleDateString() : '—'} → {p.endDate ? new Date(p.endDate).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{peso(p.budgetAllocation || 0)}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {s ? (
                                  <>
                                    <div className="font-semibold text-gray-900">{peso(s.spent)}</div>
                                    <div className="text-xs text-gray-400">PRs {peso(s.spentPrs)} · Exp. {peso(s.spentExpenses)}</div>
                                  </>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {!s ? <span className="text-gray-400">—</span>
                                  : s.overBudget > 0
                                    ? <div><div className="font-semibold text-red-600">{peso(0)}</div><div className="text-xs font-medium text-red-600">Over by {peso(s.overBudget)}</div></div>
                                    : <span className="font-semibold text-gray-900">{peso(s.remaining)}</span>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button onClick={() => setExpensesFor({ kind: 'project', id: p.id, name: p.name })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Receipt className="w-3.5 h-3.5" /> Expenses</button>
                                <button onClick={() => { setEditingProject(p); setShowProjectModal(true); }} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                <button onClick={() => deleteProject(p)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>
          )}

          {view === 'facilities' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Facilities</h2>
                  <p className="text-sm text-gray-500">Internal company facilities (equipment/items used internally, not client projects). A facility is a named category that purchase requests can be tagged to — they appear in the "For (Project)" picker under Facilities. Spent is the total of purchase requests charged to each.</p>
                </div>
                <button onClick={() => { setEditingFacility(null); setShowFacilityModal(true); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Facility</button>
              </div>
              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : facilities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Building2 className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No facilities yet</p></div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            <th className="px-4 py-3">Facility</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Spent</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facilities.map(f => {
                            const fs = facilitySpend ? facilitySpend[f.id] ?? null : null;
                            const spent = facilitySpend ? (fs ? fs.spent : 0) : null;
                            return (
                              <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{f.name}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 max-w-md">{f.description || '—'}</td>
                                <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                                  {spent === null ? <span className="font-normal text-gray-400">—</span> : <>
                                    <div>{peso(spent)}</div>
                                    {fs && fs.spentExpenses > 0 && <div className="text-xs font-normal text-gray-400">PRs {peso(fs.spentPrs)} · Exp. {peso(fs.spentExpenses)}</div>}
                                  </>}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button onClick={() => setExpensesFor({ kind: 'facility', id: f.id, name: f.name })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Receipt className="w-3.5 h-3.5" /> Expenses</button>
                                  <button onClick={() => { setEditingFacility(f); setShowFacilityModal(true); }} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                  <button onClick={() => deleteFacility(f)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>
          )}


          {/* ---- Trading Deals: cost centres for the company's trading purchases ---- */}
          {view === 'tradings' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Trading Deals</h2>
                  <p className="text-sm text-gray-500">Each trading deal is its own cost centre, like a project — purchase requests and expenses charged to it add up here. Cost is the total of its purchase requests plus its share of any expense. Set a selling price to see profit and margin; there is no budget. Margin updates as costs are logged, so it tightens until the deal is done.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
                  <button onClick={() => setLogExpense({ target: null })} disabled={projects.length === 0 && tradings.length === 0 && facilities.length === 0} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><Receipt className="w-4 h-4" /> New Voucher</button>
                  <button onClick={() => { setEditingTrading(null); setShowTradingModal(true); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Trading</button>
                </div>
              </div>
              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : tradings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><ArrowLeftRight className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No trading deals yet</p><p className="text-sm">Create one to start tracking what a trade cost.</p></div>
                ) : (
                  <>
                  {/* PROFIT on both VAT bases — the headline, above the table. Identical panel and
                      identical bars to the Project Allocation tab, from the same server figures, so
                      the two tabs cannot describe the same arithmetic differently. */}
                  <DualBasisProfit rows={tradingBasisRows} totals={rollup?.tradings ?? null} label="deal" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <TradingProfitBars rows={tradingBarRows} basis="exVat" />
                    <TradingProfitBars rows={tradingBarRows} basis="incVat" />
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            <th className="px-4 py-3">Trading</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right" title="As recorded: purchase-request cost is VAT-exclusive, logged expenses are VAT-inclusive receipts. The profit panel above restates this on each basis.">Cost <span className="normal-case font-normal text-gray-400">(as recorded)</span></th>
                            <th className="px-4 py-3 text-right">Selling price</th>
                            <th className="px-4 py-3 text-right" title="Selling price minus cost as recorded, i.e. the original mixed-basis figure. See the panel above for the like-for-like view.">Profit <span className="normal-case font-normal text-gray-400">(mixed basis)</span></th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tradings.map(t => {
                            const sp = tradingSpend?.[t.id] ?? null;
                            return (
                            <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{t.name}</div>
                                {t.client && <div className="text-xs text-gray-400">{t.client}</div>}
                              </td>
                              <td className="px-4 py-3"><span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200">{t.status || 'Active'}</span></td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {sp ? (
                                  <>
                                    <div className="font-semibold text-gray-900">{peso(sp.spent)}</div>
                                    <div className="text-xs text-gray-400">PRs {peso(sp.spentPrs)} · Exp. {peso(sp.spentExpenses)}</div>
                                  </>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-900">
                                {t.sellingPrice != null ? (
                                  <>
                                    <div>{peso(t.sellingPrice)}</div>
                                    <div className="text-xs text-gray-400">
                                      {(VAT_BASIS_OPTIONS.find(o => o.value === (sp?.sellingPriceVat ?? t.sellingPriceVat ?? 'inclusive')) ?? VAT_BASIS_OPTIONS[0]).label}
                                    </div>
                                  </>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              {/* Profit only means something once a selling price is recorded; without
                                  one this says so rather than implying a loss equal to the whole cost.
                                  A price of 0 counts as unpriced too — the server returns null for both. */}
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {!sp || sp.margin === null ? <span className="text-xs text-gray-400">set selling price</span>
                                  : <>
                                      <div className={`font-semibold ${sp.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{peso(sp.margin)}</div>
                                      {sp.marginPercent !== null && (
                                        <div className={`text-xs font-medium ${sp.margin < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                          {sp.marginPercent < 0 ? '−' : ''}{Math.abs(sp.marginPercent).toFixed(1)}%{sp.margin < 0 ? ' loss' : ' margin'}
                                        </div>
                                      )}
                                    </>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button onClick={() => setExpensesFor({ kind: 'trading', id: t.id, name: t.name })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Receipt className="w-3.5 h-3.5" /> Expenses</button>
                                <button onClick={() => { setEditingTrading(t); setShowTradingModal(true); }} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                <button onClick={() => deleteTrading(t)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  </>
                )}
            </div>
          )}
          {view === 'requests' && (
            <div className="space-y-4">
              {!signature && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <PenTool className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    You haven't set an e-signature yet. <button onClick={() => setView('signature')} className="font-semibold underline">Set it now</button> — it's stamped on each request you review.
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search PR #, employee, project…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">All statuses</option>
                  <option value="pending">Pending (needs review)</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="ordered">Ordered</option>
                  <option value="approved">Approved</option>
                  <option value="disapproved">Disapproved</option>
                </select>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><ClipboardList className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No purchase requests</p></div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map(pr => (
                      <div key={pr.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{pr.prNumber}</h3>
                              <span className="text-xs text-gray-400">{pr.items.length} item{pr.items.length !== 1 ? 's' : ''}</span>
                              <span className="text-xs text-gray-400">· {pr.projectName || 'Personal use'}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{pr.items.map(i => i.description).join(', ')}</p>
                            <p className="text-xs text-gray-400 mt-1">Prepared by <span className="text-gray-600 font-medium">{pr.employeeName || '—'}</span>{pr.checkedBy && <> · Reviewed by <span className="text-gray-600 font-medium">{pr.checkedBy}</span></>}</p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className={`text-xs font-semibold ${statusPill(pr.status)}`}>{statusLabel(pr.status)}</span>
                            {nextDeptFor(pr.status, 'pr') && <div className="text-[11px] text-gray-400">{nextDeptFor(pr.status, 'pr')}</div>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {pr.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(pr.createdAt).toLocaleDateString()}</span>}
                            {pr.neededBy && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />needed {new Date(pr.neededBy).toLocaleDateString()}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 mr-1">{peso(pr.total)}</span>
                            <button onClick={() => setViewing(pr)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Eye className="w-3.5 h-3.5" /> View</button>
                            {pr.status === 'pending' && <>
                              <button onClick={() => reject(pr)} disabled={busyId === pr.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                              <button onClick={() => review(pr)} disabled={busyId === pr.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Confirm Reviewed</button>
                            </>}
                            {pr.status !== 'pending' && (
                              <button onClick={() => printReviewReport(pr)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {view === 'orders' && (
            <div className="space-y-4">
              {!signature && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <PenTool className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    You haven't set an e-signature yet. <button onClick={() => setView('signature')} className="font-semibold underline">Set it now</button> — it's stamped on each order you review.
                  </div>
                </div>
              )}
              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><FileText className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No purchase orders</p><p className="text-xs mt-1">Purchasing raises these against verified requests.</p></div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-xs font-medium text-gray-500">Allocated to</span>
                      <AllocationFilter rows={orders} value={poAlloc} onChange={setPoAlloc}
                        className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[260px]" />
                      {poAlloc && <button onClick={() => setPoAlloc('')} className="text-xs font-medium text-blue-600 hover:underline">Clear</button>}
                      {poAlloc && <span className="text-xs text-gray-400">{shownOrders.length} of {orders.length} orders</span>}
                    </div>
                    {shownOrders.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">No purchase orders match that allocation.</p>}
                    {shownOrders.map(po => (
                      <div key={po.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{po.poNumber}</h3>
                              {po.prNumber && <span className="text-xs text-gray-400">· for {po.prNumber}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">Supplier <span className="text-gray-600 font-medium">{po.client || '—'}</span></p>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 min-w-0">Allocated to <span className="text-gray-700 font-medium min-w-0"><AllocationTag a={po} maxWidth={320} /></span></p>
                            <p className="text-xs text-gray-400 mt-1">Prepared by <span className="text-gray-600 font-medium">{po.processedBy || '—'}</span>{po.poReviewedBy && <> · Reviewed by <span className="text-gray-600 font-medium">{po.poReviewedBy}</span></>}</p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className="text-xs font-semibold text-brand-gold">
                              {po.status === 'pending' ? 'Needs review'
                                : po.status === 'accounting-approved' ? 'Awaiting admin'
                                : po.status === 'rejected' ? 'Rejected'
                                : po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                            </span>
                            {nextDeptFor(po.status, 'po') && <div className="text-[11px] text-gray-400">{nextDeptFor(po.status, 'po')}</div>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {po.createdDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(po.createdDate).toLocaleDateString()}</span>}
                            {po.deliveryDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />delivery {new Date(po.deliveryDate).toLocaleDateString()}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 mr-1">{peso(po.amount)}</span>
                            {po.status === 'pending' && <>
                              <button onClick={() => reviewOrder(po, 'rejected')} disabled={busyId === po.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                              <button onClick={() => reviewOrder(po, 'approved')} disabled={busyId === po.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Confirm Reviewed</button>
                            </>}
                            <button onClick={() => printOrder(po)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
          {view === 'new-pr' && <CreatePurchaseRequestForm fetchApi={aFetch} session={session} />}
        </main>
      </div>

      {viewing && (
        <DetailModal pr={viewing} busy={busyId === viewing.id} onReview={review} onReject={reject} onPrint={printReviewReport} onClose={() => setViewing(null)} />
      )}
      {showProjectModal && (
        <ProjectModal initial={editingProject} onClose={() => setShowProjectModal(false)} onSaved={() => { setShowProjectModal(false); loadAll(); }} />
      )}
      {showFacilityModal && (
        <FacilityModal initial={editingFacility} onClose={() => setShowFacilityModal(false)} onSaved={() => { setShowFacilityModal(false); loadAll(); }} />
      )}
      {showTradingModal && (
        <TradingModal trading={editingTrading} onClose={() => { setShowTradingModal(false); setEditingTrading(null); }}
          onSaved={() => { setShowTradingModal(false); setEditingTrading(null); loadAll(); }} />
      )}
      {/* Expenses list first, voucher form after it: opened from inside the list, the voucher form is the
          later sibling and so sits on top of it. */}
      {expensesFor && (
        <ExpensesModal target={expensesFor} reloadKey={expensesReload}
          stats={expenseStats(expensesFor)}
          onClose={() => setExpensesFor(null)} onLog={() => setLogExpense({ target: expensesFor })}
          onChanged={() => loadAll({ silent: true })} />
      )}
      {logExpense && (
        <DisbursementVoucherModal api={aFetch} projects={projects} tradings={tradings} facilities={facilities}
          initialTarget={logExpense.target} initialPoId={logExpense.poId ?? null}
          onClose={() => setLogExpense(null)}
          onSaved={() => { setLogExpense(null); setExpensesReload(n => n + 1); loadAll({ silent: true }); }} />
      )}
    </div>
  );
}

export function AccountingPortal() {
  useDocumentTitle('Accounting');
  const [session, setSession] = useState<Session | null>(readSession());

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {session ? <Portal session={session} onSignOut={signOut} /> : <AccountingLogin onLoggedIn={setSession} />}
    </ErrorBoundary>
  );
}
