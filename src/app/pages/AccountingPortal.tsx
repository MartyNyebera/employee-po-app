import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, PenTool, Menu, X, Search, Clock, Calendar, CheckCircle2,
  XCircle, Printer, LogOut, Upload, Eraser, Eye, Briefcase, Plus, Trash2, Pencil,
  PanelLeftClose, PanelLeftOpen, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { esc, printPurchaseOrder } from '../lib/orderPrint';
import { renderPrintDocument } from '../lib/printChrome';

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
type PortalView = 'requests' | 'orders' | 'projects' | 'signature';

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
}

interface PRItem { no?: number; description: string; quantity: number; unit: string; unitCost: number; amount: number; }
interface PurchaseRequest {
  id: string; prNumber: string; employeeName?: string; projectName?: string | null;
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
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

const TOKEN_KEY = 'accounting_token';
const SESSION_KEY = 'accounting_session';
const PROJECT_STATUSES = ['Active', 'On Hold', 'Completed'];

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
    .meta { display:flex; flex-wrap:wrap; gap:6px 32px; margin:14px 0; font-size:10pt; }
    .meta div span { font-weight:bold; }
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
      <div><span>PR No.:</span> ${esc(pr.prNumber)}</div>
      <div><span>For (Project):</span> ${esc(pr.projectName || 'Personal use')}</div>
      <div><span>Date filed:</span> ${esc(pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—')}</div>
      <div><span>Needed by:</span> ${esc(pr.neededBy ? new Date(pr.neededBy).toLocaleDateString() : '—')}</div>
    </div>
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
    docTitle: 'PURCHASE REQUEST REVIEW REPORT',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
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
            <Meta label="Date filed" value={pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—'} />
            <Meta label="Needed by" value={pr.neededBy ? new Date(pr.neededBy).toLocaleDateString() : '—'} />
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

// ============================================================================
// Project modal — the full project record (mirrors the admin Projects tab)
// ============================================================================
function ProjectModal({ initial, onClose, onSaved }: { initial: Project | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name || '', description: initial?.description || '', status: initial?.status || 'Active',
    client: initial?.client || '', location: initial?.location || '',
    startDate: (initial?.startDate || '').slice(0, 10), endDate: (initial?.endDate || '').slice(0, 10),
    budgetAllocation: String(initial?.budgetAllocation ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast.error('Project name is required'); return; }
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(), description: f.description.trim() || null, status: f.status,
        client: f.client.trim() || null, location: f.location.trim() || null,
        startDate: f.startDate || null, endDate: f.endDate || null,
        budgetAllocation: Number(f.budgetAllocation) || 0,
      };
      if (initial) await aFetch(`/projects/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await aFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Project updated' : 'Project created');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{initial ? 'Edit Project' : 'New Project'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project name <span className="text-red-500">*</span></label>
            <input value={f.name} onChange={e => set('name', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={f.description} onChange={e => set('description', e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={f.status} onChange={e => set('status', e.target.value)} className={`${input} bg-white`}>
                {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget allocation (₱)</label>
              <input type="number" min="0" step="0.01" value={f.budgetAllocation} onChange={e => set('budgetAllocation', e.target.value)} placeholder="0.00" className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client / owner</label>
              <input value={f.client} onChange={e => set('client', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input value={f.location} onChange={e => set('location', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
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
// Portal shell
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('requests');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | PRStatus>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [viewing, setViewing] = useState<PurchaseRequest | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [prs, pos, prj, sig] = await Promise.all([
        aFetch<PurchaseRequest[]>('/purchase-requests'),
        aFetch<PurchaseOrder[]>('/purchase-orders').catch(() => [] as PurchaseOrder[]),
        aFetch<Project[]>('/projects'),
        aFetch<{ signature: string | null }>('/accounting/signature').catch(() => ({ signature: null })),
      ]);
      setRequests(prs || []);
      // Only real purchase orders (the table is shared with Sales Orders, discriminated by
      // order_type — accounting reviews purchases, not sales).
      setOrders((pos || []).filter(o => (o as any).orderType !== 'sales'));
      setProjects(prj || []);
      setSignature(sig?.signature || null);
    } catch (e: any) {
      if (!silent) toast.error(e.message || 'Failed to load data');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  // Paused while a review is in flight or a project modal is open.
  useLiveRefresh(() => loadAll({ silent: true }), { enabled: !busyId && !showProjectModal && !editingProject });

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

  const filtered = useMemo(() => requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || r.prNumber.toLowerCase().includes(q) || (r.employeeName || '').toLowerCase().includes(q) || (r.projectName || '').toLowerCase().includes(q);
  }), [requests, statusFilter, search]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const pendingOrderCount = orders.filter(o => o.status === 'pending').length;

  const NAV: { id: PortalView; label: string; icon: any }[] = [
    { id: 'requests', label: 'Purchase Requests', icon: ClipboardList },
    { id: 'orders', label: 'Purchase Orders', icon: FileText },
    { id: 'projects', label: 'Projects', icon: Briefcase },
    { id: 'signature', label: 'My Signature', icon: PenTool },
  ];

  const sidebar = (
    <div className="bg-white flex flex-col h-full border-r border-gray-200">
      <div className="border-b border-gray-200">
        <div className={`flex items-center gap-2 px-3 py-3 ${collapsed ? 'justify-center' : ''}`}>
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0">
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {!collapsed && <span className="text-sm font-semibold tracking-wide text-gray-500">Accounting</span>}
        </div>
        <div className={`flex justify-center ${collapsed ? 'px-2 pt-2 pb-3' : 'px-5 pt-4 pb-4'}`}>
          <img src="/kimoel-logo.png" alt="Logo" className={`${collapsed ? 'h-10' : 'h-32'} w-auto object-contain transition-all duration-200`} />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button key={id} title={label} onClick={() => { setView(id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>{label}</span>}
              {!collapsed && id === 'requests' && pendingCount > 0 && <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-yellow-100 text-yellow-700'}`}>{pendingCount}</span>}
              {!collapsed && id === 'orders' && pendingOrderCount > 0 && <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-yellow-100 text-yellow-700'}`}>{pendingOrderCount}</span>}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{(session.full_name || '?').charAt(0).toUpperCase()}</span></div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{session.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{session.email}</p>
            </div>
          )}
        </div>
        <button onClick={onSignOut} title="Sign out" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 ${collapsed ? 'justify-center' : ''}`}>
          <LogOut className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className={`flex-shrink-0 w-64 z-30 lg:relative lg:flex lg:flex-col transition-all duration-200 ${collapsed ? 'lg:w-20' : 'lg:w-64'} ${mobileOpen ? 'fixed inset-y-0 left-0 flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>{sidebar}</div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between bg-white border-b border-gray-200 px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {view === 'signature' && <SignaturePad initial={signature} onSaved={setSignature} />}

          {view === 'projects' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Projects</h2>
                  <p className="text-sm text-gray-500">Project master data — these appear in the employee's "For (Project)" picker.</p>
                </div>
                <button onClick={() => { setEditingProject(null); setShowProjectModal(true); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Project</button>
              </div>
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
                            <th className="px-4 py-3">Client</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Timeline</th>
                            <th className="px-4 py-3 text-right">Budget</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.map(p => (
                            <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{p.name}</div>
                                {p.location && <div className="text-xs text-gray-400">{p.location}</div>}
                              </td>
                              <td className="px-4 py-3 text-gray-500">{p.client || '—'}</td>
                              <td className="px-4 py-3"><span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200">{p.status || 'Active'}</span></td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {p.startDate ? new Date(p.startDate).toLocaleDateString() : '—'} → {p.endDate ? new Date(p.endDate).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">{peso(p.budgetAllocation || 0)}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button onClick={() => { setEditingProject(p); setShowProjectModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                <button onClick={() => deleteProject(p)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
                          <span className={`flex-shrink-0 text-xs font-semibold ${statusPill(pr.status)}`}>{statusLabel(pr.status)}</span>
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
                    {orders.map(po => (
                      <div key={po.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{po.poNumber}</h3>
                              {po.prNumber && <span className="text-xs text-gray-400">· for {po.prNumber}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">Supplier <span className="text-gray-600 font-medium">{po.client || '—'}</span></p>
                            <p className="text-xs text-gray-400 mt-1">Prepared by <span className="text-gray-600 font-medium">{po.processedBy || '—'}</span>{po.poReviewedBy && <> · Reviewed by <span className="text-gray-600 font-medium">{po.poReviewedBy}</span></>}</p>
                          </div>
                          <span className="flex-shrink-0 text-xs font-semibold text-brand-gold">
                            {po.status === 'pending' ? 'Needs review'
                              : po.status === 'accounting-approved' ? 'Awaiting admin'
                              : po.status === 'rejected' ? 'Rejected'
                              : po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                          </span>
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
        </main>
      </div>

      {viewing && (
        <DetailModal pr={viewing} busy={busyId === viewing.id} onReview={review} onReject={reject} onPrint={printReviewReport} onClose={() => setViewing(null)} />
      )}
      {showProjectModal && (
        <ProjectModal initial={editingProject} onClose={() => setShowProjectModal(false)} onSaved={() => { setShowProjectModal(false); loadAll(); }} />
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
