import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, PenTool, Menu, X, Search, Clock, Calendar,
  Printer, LogOut, Upload, Eraser, Eye, FileText, Factory,
  PanelLeftClose, PanelLeftOpen, Plus, Pencil, Trash2, Paperclip, RefreshCw, PackageMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { WithdrawalTab } from '../components/WithdrawalTab';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { printPurchaseOrder, esc } from '../lib/orderPrint';
import { renderPrintDocument } from '../lib/printChrome';
import { NavBadge } from '../components/NavBadge';
import { CreatePurchaseRequestForm } from '../components/CreatePurchaseRequestForm';
import { AttentionCard } from '../components/AttentionCard';

// ============================================================================
// Purchasing Management portal (/purchasing). Fully independent of the admin
// dashboard: purchasing staff sign in here with a dedicated Purchasing Account
// (created by an admin), using its OWN token/session — separate from the admin
// `fleet_auth` and from the employee `employee_token`.
//
// Their job in the chain: take a request Accounting has already checked, assign a
// supplier from the CRM directory, and raise the purchase order — which the admin
// then approves. Requests still awaiting Accounting are not theirs to see, and the
// server enforces that (GET /purchase-requests hides 'pending' from this role).
// ============================================================================

type PRStatus = 'pending' | 'reviewed' | 'verified' | 'ordered' | 'approved' | 'disapproved';
type PortalView = 'new-pr' | 'requests' | 'orders' | 'suppliers' | 'withdrawals' | 'signature';

// unitCost/amount are the employee's ESTIMATE; finalUnitCost/finalAmount are what Purchasing
// priced the line at when they raised the order. Both are kept — see final_total in schema.
// `inventoryId` is the inventory row this line actually refers to (the employee picked it from
// the inventory list). It must survive onto the purchase order's line items — it is what lets a
// delivered order add stock back to the right row instead of guessing from the name.
interface PRItem { no?: number; description: string; inventoryId?: string | null; quantity: number; unit: string; unitCost: number; amount: number; finalUnitCost?: number | null; finalAmount?: number | null; }
interface PurchaseRequest {
  id: string; prNumber: string; employeeName?: string; projectName?: string | null;
  neededBy?: string; supplier?: string; notes?: string; items: PRItem[]; total: number; finalTotal?: number | null;
  status: PRStatus; checkedBy?: string | null; checkedAt?: string | null; checkedSignature?: string | null;
  verifiedBy?: string | null; verifiedAt?: string | null;
  reviewedBy?: string; createdAt?: string;
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

// Mirrors the CRM supplier directory (see components/crm/SuppliersList.tsx).
// `hasCertificate` is a flag, not the document: the list endpoint deliberately omits the
// scan so a directory of suppliers doesn't drag megabytes of base64 with it.
interface Supplier {
  id: string; name: string; type?: string; productsSupplied?: string; contactPerson?: string;
  phone?: string; email?: string; location?: string; paymentTerms?: string;
  tin?: string | null; hasCertificate?: boolean; certificateFilename?: string | null;
}

interface PurchaseOrder {
  id: string; poNumber: string; client: string; amount: number;
  status: string; createdDate?: string; deliveryDate?: string; orderType?: string | null;
  preparedBy?: string | null; supplierId?: string | null;
  purchaseRequestId?: string | null; prNumber?: string | null; prStatus?: PRStatus | null;
  approvedBy?: string | null; approvedAt?: string | null;
  // Carried for the printed document. All returned by GET /purchase-orders already.
  description?: string | null; docDate?: string | null; reviewedBy?: string | null;
  supplierAddress?: string | null; supplierContact?: string | null; supplierTin?: string | null;
  paymentTerms?: string | null; termsAndConditions?: string | null;
}

// Section C — #12: a PO now carries its own two-gate status. 'rejected' means an admin or
// accounting sent it back here to revise & resubmit.
const orderState = (po: PurchaseOrder): { label: string; hint: string | null } => {
  if (po.status === 'rejected') return { label: 'Rejected', hint: 'Sent back — revise & resubmit' };
  if (po.status === 'approved') return { label: 'Approved', hint: 'With the warehouse for delivery' };
  if (po.status === 'pending') return { label: 'Pending', hint: 'Awaiting accounting review' };
  if (po.status === 'accounting-approved') return { label: 'In review', hint: 'Awaiting admin approval' };
  // Set on the delivery leg once approved — the raw values are storage-shaped
  // ('in-progress', 'RECEIVED') and would otherwise leak onto the screen verbatim.
  if (po.status === 'in-progress') return { label: 'Ongoing delivery', hint: 'In transit from supplier' };
  if (po.status === 'RECEIVED') return { label: 'Delivered', hint: 'Received in full' };
  if (po.status === 'cancelled') return { label: 'Cancelled', hint: 'Cancelled on the delivery leg' };
  return { label: statusLabel(po.status as PRStatus), hint: null };
};

const TOKEN_KEY = 'purchasing_token';
const SESSION_KEY = 'purchasing_session';

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 'reviewed' used to render as "Checked" here and "Reviewed" everywhere else — one value,
// two vocabularies. Unified to the plain status word.
const statusLabel = (s: PRStatus) => s.charAt(0).toUpperCase() + s.slice(1);
// Matches Production and Accounting: plain brand-gold text, no pill background or border.
// The word itself distinguishes the stage; the grey hint beneath carries the detail.
const statusPill = (_s: PRStatus): string => 'text-brand-gold';

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// ---- Certificate-of-registration file handling ------------------------------------------
// The server accepts a data-URL up to 5,000,000 characters (~3.7 MB decoded). A phone photo
// of an A4 document blows past that, so images are redrawn onto a capped canvas and
// re-encoded as JPEG first — the same trick SignaturePad uses, but at a resolution that
// keeps a document legible rather than 560x200. PDFs can't be re-encoded in the browser, so
// they're size-checked and passed through.
const CERT_MAX_CHARS = 5_000_000;
const CERT_MAX_EDGE = 1600;

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the file'));
  r.readAsDataURL(file);
});

async function fileToCertificateDataUrl(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    const url = await readAsDataUrl(file);
    if (url.length > CERT_MAX_CHARS) throw new Error('That PDF is too large — keep it under about 3 MB.');
    return url;
  }
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Upload a PNG, JPEG or PDF file');

  const src = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('That image could not be read'));
    i.src = src;
  });

  const scale = Math.min(1, CERT_MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Could not process the image');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);

  let out = canvas.toDataURL('image/jpeg', 0.75);
  if (out.length > CERT_MAX_CHARS) out = canvas.toDataURL('image/jpeg', 0.5);
  if (out.length > CERT_MAX_CHARS) throw new Error('That scan is too large even after compression — try a lower-resolution scan.');
  return out;
}

// A top-level `data:` navigation is blocked by browsers, so the stored data-URL is turned
// into a Blob and opened via an object URL. Works for images and PDFs alike.
function openDataUrl(dataUrl: string) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(url, '_blank');
  // Revoke late: revoking immediately can race the new tab's load.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Purchasing-authed fetch (sends purchasing_token). Distinct from admin client.ts and employee auth.
async function pFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
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
// Login (its own endpoint — /api/purchasing/login)
// ============================================================================
function PurchasingLogin({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/purchasing/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.purchasing));
      onLoggedIn(data.purchasing);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-4">
          <img src="/kimoel-logo.png" alt="Kimoel" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Purchasing Management</h1>
            <p className="text-sm text-gray-500">Sign in with your purchasing account</p>
          </div>
        </div>
        <form onSubmit={submit} className="p-8 pt-2 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-xs text-gray-400 text-center">No account? Ask your admin to create one for you.</p>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Signature pad (draw or upload) — saved as a data-URL to the purchasing account
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
      const res = await pFetch<{ signature: string }>('/purchasing/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      onSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">My e-signature</h2>
        <p className="text-sm text-gray-500 mt-0.5">This signature is stamped on every purchase request you mark as checked. Draw below or upload an image.</p>
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
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors ml-auto">{saving ? 'Saving…' : 'Save signature'}</button>
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
// Printable proof-of-check report (new-window HTML)
// ============================================================================
async function printCheckReport(pr: PurchaseRequest) {
  // Open the window synchronously — inside the click — or the popup blocker kills it. The
  // signature fetch happens after, into the already-open window.
  const w = window.open('', '_blank');
  if (!w) { toast.error('Please allow popups to print the report'); return; }
  w.document.write('<!doctype html><title>Preparing…</title><body style="font:14px sans-serif;padding:2rem;color:#555">Preparing the report…</body>');

  // Signatures are ~20KB each and are deliberately not carried on the request list; fetch
  // them per document. Falls back to the list's checked signature if the lookup fails.
  let preparedSignature: string | null = null;
  let approvedSignature: string | null = null;
  let checkedSignature: string | null = pr.checkedSignature ?? null;
  try {
    const s = await pFetch<{ preparedSignature: string | null; checkedSignature: string | null; approvedSignature: string | null }>(`/purchase-requests/${pr.id}/signatures`);
    preparedSignature = s.preparedSignature;
    approvedSignature = s.approvedSignature;
    checkedSignature = s.checkedSignature ?? checkedSignature;
  } catch {
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
  // Fixed-height slot whether or not a signature exists, so the three rule lines stay level.
  const sigImg = (src: string | null) => src
    ? `<img src="${esc(src)}" style="height:70px;object-fit:contain" />`
    : `<div style="height:70px"></div>`;
  // Date under each block. Omitted entirely when the event hasn't happened — an empty date
  // under an unsigned block reads as missing data rather than not-yet.
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
       break-inside keeps a signature from being split off its name across a page. */
    .sign-row { display:flex; gap:20px; margin-top:26px; break-inside:avoid; }
    .sign-wrap { flex:1; min-width:0; }
    .sign-line { border-bottom:1px solid #000; }
    .sign-name { font-weight:bold; margin-top:3px; font-size:10pt; }
    .sign-role { font-size:9pt; }
    .sign-date { font-size:8.5pt; color:#333; margin-top:1px; }
`;
  const body = `
    <div class="meta">
      <div class="meta-left">
        <div><span>For (Project):</span> ${esc(pr.projectName || 'Personal use')}</div>
        <div><span>Date filed:</span> ${esc(pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—')}</div>
        <div><span>Needed by:</span> ${esc(pr.neededBy ? new Date(pr.neededBy).toLocaleDateString() : '—')}</div>
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
      This certifies that the purchase request above was <b>reviewed and checked by Accounting</b> on ${esc(checkedDate)}${pr.verifiedBy ? ` and <b>approved by ${esc(pr.verifiedBy)}</b> on ${esc(verifiedDate)}` : ''}.
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
// Add / edit a supplier. Deliberately the five fields purchasing actually needs — the
// admin's Monitoring ▸ Suppliers keeps the fuller form (type, price level, reliability…)
// against the same table.
//
// The certificate is saved through its own route rather than in the supplier body: the
// admin form PATCHes its whole state, so a document carried in the record would re-upload
// on every unrelated edit.
// ============================================================================
function SupplierModal({ initial, onClose, onSaved }: {
  initial: Supplier | null; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: initial?.name || '', location: initial?.location || '',
    phone: initial?.phone || '', tin: initial?.tin || '',
  });
  const [certData, setCertData] = useState<string | null>(null);       // newly picked file
  const [certName, setCertName] = useState<string | null>(initial?.certificateFilename || null);
  const [hasCert, setHasCert] = useState(!!initial?.hasCertificate);
  const [removeCert, setRemoveCert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const data = await fileToCertificateDataUrl(file);
      setCertData(data);
      setCertName(file.name);
      setHasCert(true);
      setRemoveCert(false);
    } catch (err: any) { toast.error(err.message || 'Could not read that file'); }
    finally { setBusy(false); }
  };

  const view = async () => {
    if (certData) { openDataUrl(certData); return; }
    if (!initial) return;
    try {
      const r = await pFetch<{ certificate: string | null }>(`/suppliers/${initial.id}/certificate`);
      if (!r.certificate) { toast.error('No certificate on file'); return; }
      openDataUrl(r.certificate);
    } catch (e: any) { toast.error('Could not open the certificate: ' + e.message); }
  };

  const save = async () => {
    if (!f.name.trim()) { toast.error('Supplier name is required'); return; }
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        location: f.location.trim() || null,
        phone: f.phone.trim() || null,
        tin: f.tin.trim() || null,
      };
      const id = initial
        ? (await pFetch<Supplier>(`/suppliers/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) })).id
        : (await pFetch<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(body) })).id;

      if (certData) {
        await pFetch(`/suppliers/${id}/certificate`, { method: 'PUT', body: JSON.stringify({ certificate: certData, filename: certName }) });
      } else if (removeCert && initial) {
        await pFetch(`/suppliers/${id}/certificate`, { method: 'DELETE' });
      }
      toast.success(initial ? 'Supplier updated' : 'Supplier added');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{initial ? 'Edit Supplier' : 'Add Supplier'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier name <span className="text-red-500">*</span></label>
            <input value={f.name} onChange={e => set('name', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={f.location} onChange={e => set('location', e.target.value)} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact number</label>
              <input value={f.phone} onChange={e => set('phone', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TIN number</label>
              <input value={f.tin} onChange={e => set('tin', e.target.value)} placeholder="000-000-000-000" className={input} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate of registration</label>
            {hasCert && !removeCert ? (
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{certName || 'Certificate on file'}</span>
                <button onClick={view} className="text-xs font-medium text-brand-gold hover:underline flex-shrink-0">View</button>
                <button onClick={() => { setCertData(null); setCertName(null); setHasCert(false); setRemoveCert(true); }}
                  className="text-xs font-medium text-red-600 hover:underline flex-shrink-0">Remove</button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-4 text-sm text-gray-500 ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                <Upload className="w-4 h-4" />
                {busy ? 'Processing…' : 'Upload a scan (PNG, JPEG or PDF)'}
                <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={onPick} disabled={busy} className="hidden" />
              </label>
            )}
            <p className="text-xs text-gray-400 mt-1.5">Photos and scans are compressed automatically. PDFs must be under about 3 MB.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving || busy} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : (initial ? 'Save' : 'Add Supplier')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Assign a supplier to an admin-verified request, which raises the purchase order.
// The supplier comes from the CRM directory rather than free text, so the order carries a
// real supplier_id and reconciles with Monitoring ▸ Suppliers. Items/total carry over from
// the request; purchasing supplies the supplier + dates.
// ============================================================================
function PurchaseOrderModal({ pr, session, onClose, onCreated }: {
  pr: PurchaseRequest; session: Session; onClose: () => void; onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [supplierId, setSupplierId] = useState('');
  const [f, setF] = useState({ poDate: today, deliveryDate: '' });
  // #4 — the buyer picks whether this order is domestic or foreign, and types the payment-terms
  // days. Both are new inputs on this form (the admin-side modal already had the type selector).
  const [poType, setPoType] = useState<'domestic' | 'foreign'>('domestic');
  const [termsDays, setTermsDays] = useState('30');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  // Final pricing. Seeded from the employee's estimate so the common case (the estimate was
  // right) is a no-op, but every line is editable — this is the buyer's real supplier price.
  // Held as strings: a number state would fight the user mid-typing ("6." -> 6).
  const [prices, setPrices] = useState<string[]>(() => pr.items.map(it => String(it.unitCost ?? 0)));
  const [vatType, setVatType] = useState<'vatable' | 'non-vatable'>('vatable');

  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const lineAmount = (i: number) => (Number(pr.items[i]?.quantity) || 0) * num(prices[i] ?? '0');
  const subTotal = pr.items.reduce((t, _it, i) => t + lineAmount(i), 0);
  // VAT is 12% of a vatable sale, nothing on a non-vatable one.
  const vatAmount = vatType === 'vatable' ? subTotal * 0.12 : 0;
  const totalAmount = subTotal + vatAmount;
  const estimateDelta = pr.total ? ((subTotal - pr.total) / pr.total) * 100 : 0;

  useEffect(() => {
    (async () => {
      try { setSuppliers(await pFetch<Supplier[]>('/suppliers')); }
      catch { toast.error('Could not load the supplier directory'); }
      finally { setLoadingSuppliers(false); }
    })();
  }, []);

  const supplier = suppliers.find(s => s.id === supplierId) || null;
  // Contact person and phone are separate columns; the PO stores one contact string.
  const supplierContact = supplier
    ? [supplier.contactPerson, supplier.phone].filter(Boolean).join(' · ')
    : '';
  // The days field composes the stored payment-terms text. Picking a supplier seeds it from the
  // leading number in that supplier's terms (if any), but the buyer can override.
  useEffect(() => {
    const d = supplier?.paymentTerms?.match(/\d+/)?.[0];
    if (d) setTermsDays(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);
  const terms = termsDays.trim()
    ? `${termsDays.trim()} days from receipt/acceptance`
    : (supplier?.paymentTerms?.trim() || '30 days from receipt/acceptance');

  const save = async () => {
    if (!supplier) { toast.error('Pick a supplier'); return; }
    if (!f.deliveryDate) { toast.error('Delivery date is required'); return; }
    if (prices.some(p => p.trim() === '' || num(p) < 0)) { toast.error('Every line needs a unit price of zero or more'); return; }
    setSaving(true);
    try {
      await pFetch('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          purchaseRequestId: pr.id,
          orderType: 'purchase',
          supplierId: supplier.id,
          client: supplier.name,
          customerName: supplier.name,
          customerAddress: supplier.location || null,
          customerContact: supplierContact || null,
          description: `For ${pr.prNumber} — ${pr.projectName || 'Personal use'}`,
          // Priced lines — the buyer's final costs, not the employee's estimate. The server
          // mirrors these back onto the request beside the estimate, matched by position.
          lineItems: pr.items.map((it, i) => ({
            id: String(i + 1), no: i + 1, description: it.description,
            // Carried through from the request so the delivery can find the inventory row.
            inventoryId: it.inventoryId ?? null,
            quantity: it.quantity, unit: it.unit, unitCost: num(prices[i] ?? '0'), amount: lineAmount(i),
          })),
          subTotal,
          vatAmount,
          // `amount` is the PO's headline figure — the total payable, VAT included.
          amount: totalAmount,
          totalAmount,
          poDate: f.poDate,
          createdDate: f.poDate,
          deliveryDate: f.deliveryDate,
          paymentTerms: terms,
          poType,
          preparedBy: session.full_name,
        }),
      });
      toast.success(`Purchase order raised for ${pr.prNumber} at ${peso(totalAmount)} — sent to admin for approval`);
      onCreated();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const noSuppliers = !loadingSuppliers && suppliers.length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Purchase Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">{pr.prNumber} · {pr.items.length} item{pr.items.length !== 1 ? 's' : ''} · {peso(pr.total)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
            Pick the supplier and set the final price for each line — the figures below start from the employee's estimate. Once created, an admin approves the purchase order, and that approval is what approves the request.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-red-500">*</span></label>
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} disabled={loadingSuppliers || noSuppliers}
              className={`${input} bg-white disabled:bg-gray-50 disabled:text-gray-400`}>
              <option value="">{loadingSuppliers ? 'Loading suppliers…' : noSuppliers ? 'No suppliers available' : 'Select a supplier…'}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.type ? ` — ${s.type}` : ''}</option>)}
            </select>
            {noSuppliers && (
              <p className="text-xs text-gray-400 mt-1.5">No suppliers yet — add one in the Suppliers tab first.</p>
            )}
          </div>

          {/* Read-only echo of the directory record, so the buyer can confirm they picked the
              right supplier without leaving the modal. */}
          {supplier && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 text-sm">
              <div className="flex gap-3 px-3 py-2">
                <span className="w-28 flex-shrink-0 text-xs font-medium text-gray-400 pt-0.5">Address</span>
                <span className="text-gray-700">{supplier.location || '—'}</span>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <span className="w-28 flex-shrink-0 text-xs font-medium text-gray-400 pt-0.5">Contact</span>
                <span className="text-gray-700">{supplierContact || '—'}</span>
              </div>
            </div>
          )}

          {/* #4 — PO type (domestic/foreign) and the manually-typed payment-terms days. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 whitespace-nowrap">PO type</label>
              <select value={poType} onChange={e => setPoType(e.target.value as 'domestic' | 'foreign')} className={`${input} bg-white`}>
                <option value="domestic">Domestic</option>
                <option value="foreign">Foreign</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 whitespace-nowrap">Payment terms (days)</label>
              <input type="number" min="0" step="1" value={termsDays}
                onChange={e => setTermsDays(e.target.value)} placeholder="30" className={input} />
              <p className="text-xs text-gray-400 mt-1">Stored as “{terms}”.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PO date</label>
              <input type="date" value={f.poDate} onChange={e => set('poDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery date <span className="text-red-500">*</span></label>
              <input type="date" value={f.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} className={input} />
            </div>
          </div>

          {/* ---- Final pricing ------------------------------------------------------------
              The estimate column stays visible while pricing: the buyer is checking the
              supplier's quote against what the employee expected, and the request keeps both. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Final pricing</label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left font-medium px-3 py-2">Item</th>
                    <th className="text-center font-medium px-2 py-2 w-14">Qty</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Est.</th>
                    <th className="text-right font-medium px-2 py-2 w-28">Unit price</th>
                    <th className="text-right font-medium px-3 py-2 w-24">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pr.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-700">{it.description}</td>
                      <td className="px-2 py-2 text-center text-gray-500">{it.quantity} {it.unit}</td>
                      <td className="px-2 py-2 text-right text-gray-400 tabular-nums">{peso(it.unitCost)}</td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={prices[i] ?? ''}
                          onChange={e => setPrices(p => p.map((v, j) => (j === i ? e.target.value : v)))}
                          className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums" />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">{peso(lineAmount(i))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VAT type</label>
            <select value={vatType} onChange={e => setVatType(e.target.value as any)} className={`${input} bg-white`}>
              <option value="vatable">VATable (12%)</option>
              <option value="non-vatable">Non-VATable</option>
            </select>
          </div>

          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-gray-500">Sub total</span>
              <span className="text-gray-900 tabular-nums">{peso(subTotal)}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-gray-500">VAT {vatType === 'vatable' ? '(12%)' : '(non-VATable)'}</span>
              <span className="text-gray-900 tabular-nums">{peso(vatAmount)}</span>
            </div>
            <div className="flex justify-between px-3 py-2.5 bg-gray-50">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-semibold text-gray-900 tabular-nums">{peso(totalAmount)}</span>
            </div>
          </div>

          {/* A gap against the estimate is the thing the admin will ask about — surface it
              here rather than letting it be discovered at approval time. */}
          {Math.abs(estimateDelta) >= 0.5 && (
            <p className="text-xs text-gray-500">
              Sub total is <span className="font-semibold text-brand-gold">{estimateDelta > 0 ? '+' : ''}{estimateDelta.toFixed(1)}%</span> against the employee's estimate of {peso(pr.total)}. The estimate stays on the request.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving || !supplier} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"><FileText className="w-4 h-4" /> {saving ? 'Creating…' : 'Create Purchase Order'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Full-details modal for a single purchase request
// ============================================================================
function Meta({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div><div className="text-gray-900">{value}</div></div>;
}

function DetailModal({ pr, onCreatePO, onPrint, onClose }: {
  pr: PurchaseRequest;
  onCreatePO: (pr: PurchaseRequest) => void;
  onPrint: (pr: PurchaseRequest) => void; onClose: () => void;
}) {
  // Priced once Purchasing has raised the order; until then only the estimate exists.
  const priced = pr.finalTotal !== null && pr.finalTotal !== undefined;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{pr.prNumber}</h2>
            <span className={`text-xs font-semibold ${statusPill(pr.status)}`}>{statusLabel(pr.status)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Meta label="Prepared by" value={pr.employeeName || '—'} />
            <Meta label="For (Project)" value={pr.projectName || 'Personal use'} />
            <Meta label="Date filed" value={pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—'} />
            <Meta label="Needed by" value={pr.neededBy ? new Date(pr.neededBy).toLocaleDateString() : '—'} />
            <Meta label="Supplier" value={pr.supplier || '—'} />
            <Meta label="Checked by" value={pr.checkedBy || '—'} />
            {pr.status === 'approved' && <Meta label="Approved by" value={pr.reviewedBy || '—'} />}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Items</div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="text-left font-medium px-3 py-2 w-10">No</th>
                  <th className="text-left font-medium px-3 py-2">Description</th>
                  <th className="text-right font-medium px-3 py-2 w-14">Qty</th>
                  <th className="text-left font-medium px-3 py-2 w-20">Unit</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Est. Cost</th>
                  {priced && <th className="text-right font-medium px-3 py-2 w-28">Final Cost</th>}
                  <th className="text-right font-medium px-3 py-2 w-28">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {pr.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-900">{it.description}</td>
                      <td className="px-3 py-2 text-right">{it.quantity}</td>
                      <td className="px-3 py-2">{it.unit}</td>
                      {/* Once priced, the estimate greys out — it is history, not the number to act on. */}
                      <td className={`px-3 py-2 text-right ${priced ? 'text-gray-400' : ''}`}>{peso(it.unitCost)}</td>
                      {priced && <td className="px-3 py-2 text-right">{peso(it.finalUnitCost ?? 0)}</td>}
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{peso(priced ? (it.finalAmount ?? 0) : it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end items-baseline gap-3 mt-3 text-sm">
              {priced && <span className="text-gray-400">Estimate <span className="line-through">{peso(pr.total)}</span></span>}
              <span className="font-semibold text-gray-700">{priced ? 'Final total' : 'Total'}</span>
              <span className="text-lg font-bold text-gray-900">{peso(priced ? (pr.finalTotal ?? 0) : pr.total)}</span>
            </div>
          </div>

          {pr.notes && <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Notes / Purpose</div><p className="text-sm text-gray-600 whitespace-pre-wrap">{pr.notes}</p></div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          {pr.status !== 'pending' && (
            <button onClick={() => onPrint(pr)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"><Printer className="w-4 h-4" /> Print Report</button>
          )}
          {pr.status === 'verified' ? (
            <button onClick={() => onCreatePO(pr)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"><FileText className="w-4 h-4" /> Purchase Order</button>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main portal
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('requests');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | PRStatus>('all');
  const [search, setSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [viewing, setViewing] = useState<PurchaseRequest | null>(null);
  const [creatingPOFor, setCreatingPOFor] = useState<PurchaseRequest | null>(null);

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [prs, pos, sups, sig] = await Promise.all([
        pFetch<PurchaseRequest[]>('/purchase-requests'),
        pFetch<PurchaseOrder[]>('/purchase-orders'),
        pFetch<Supplier[]>('/suppliers'),
        pFetch<{ signature: string | null }>('/purchasing/signature'),
      ]);
      setRequests(prs || []);
      // purchase_orders is shared with Sales Orders, discriminated by order_type — the
      // route has no filter for it, so sales rows are dropped here.
      setOrders((pos || []).filter(po => po.orderType !== 'sales'));
      setSuppliers(sups || []);
      setSignature(sig?.signature || null);
    } catch (e: any) {
      if (String(e.message).includes('session expired')) { onSignOut(); return; }
      if (!silent) toast.error(e.message || 'Failed to load requests');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  // Paused while a create/edit modal is open, so a background refetch never races the work
  // in a modal (the modals hold their own snapshots, but this is the conservative choice).
  useLiveRefresh(() => loadAll({ silent: true }), { enabled: !creatingPOFor && !showSupplierModal && !editingSupplier });

  // [removed] check()/reject() — Accounting now owns the review gate (/accounting).
  // Purchasing's job here is to raise the purchase order for an admin-verified request.
  const openCreatePO = (pr: PurchaseRequest) => { setViewing(null); setCreatingPOFor(pr); };

  const filtered = useMemo(() => requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || r.prNumber.toLowerCase().includes(q) || (r.employeeName || '').toLowerCase().includes(q) || (r.projectName || '').toLowerCase().includes(q);
  }), [requests, statusFilter, search]);

  const filteredOrders = useMemo(() => orders.filter(po => {
    const q = orderSearch.toLowerCase();
    return !q || po.poNumber.toLowerCase().includes(q) || (po.client || '').toLowerCase().includes(q) || (po.prNumber || '').toLowerCase().includes(q);
  }), [orders, orderSearch]);

  const filteredSuppliers = useMemo(() => suppliers.filter(s => {
    const q = supplierSearch.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.location || '').toLowerCase().includes(q) || (s.tin || '').toLowerCase().includes(q);
  }), [suppliers, supplierSearch]);

  const printOrder = async (po: PurchaseOrder) => {
    // Signatures aren't on the list payload (~20KB each) — fetched here, with this portal's
    // own authed fetch, which is why the print module takes the loader rather than importing one.
    const r = await printPurchaseOrder(po as any, () => pFetch(`/purchase-orders/${po.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  // Section C — #12: a rejected order was sent back here. Edit it (via the admin/edit flow) and
  // resubmit to send it through both gates again (→ 'pending', awaiting accounting).
  const resubmitOrder = async (po: PurchaseOrder) => {
    if (!(await confirmDialog({ title: `Resubmit ${po.poNumber}?`, message: 'It goes back to Accounting for review, then Admin approval.', confirmLabel: 'Resubmit' }))) return;
    try {
      await pFetch(`/purchase-orders/${po.id}/resubmit`, { method: 'PUT' });
      toast.success('Purchase order resubmitted');
      loadAll();
    } catch (e: any) {
      toast.error('Failed: ' + (e?.message || 'unknown error'));
    }
  };

  const deleteSupplier = async (s: Supplier) => {
    if (!(await confirmDialog({ title: `Delete ${s.name}?`, message: 'Purchase orders already raised against them keep their details.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await pFetch(`/suppliers/${s.id}`, { method: 'DELETE' });
      toast.success('Supplier deleted');
      loadAll();
    } catch (e: any) { toast.error('Delete failed: ' + e.message); }
  };

  // Purchasing acts on requests Accounting has already reviewed — those still need a PO.
  const awaitingPOCount = requests.filter(r => r.status === 'verified').length;
  // Rejected orders sent back here to revise & resubmit (Section C).
  const rejectedPOCount = orders.filter(o => o.status === 'rejected').length;

  const NAV: { id: PortalView; label: string; icon: any }[] = [
    { id: 'new-pr', label: 'New Purchase Request', icon: FileText },
    { id: 'requests', label: 'Purchase Requests', icon: ClipboardList },
    { id: 'orders', label: 'Purchase Orders', icon: FileText },
    { id: 'suppliers', label: 'Suppliers', icon: Factory },
    { id: 'withdrawals', label: 'Withdrawals', icon: PackageMinus },
    { id: 'signature', label: 'My Signature', icon: PenTool },
  ];

  const sidebar = (
    <div className="bg-white flex flex-col h-full border-r border-gray-200">
      <div className="border-b border-gray-200">
        <div className={`flex items-center gap-2 px-3 py-3 ${collapsed ? 'justify-center' : ''}`}>
          {/* Purpose-built sidebar icons: the panel glyph shows which way it will move.
              text-gray-500 (#5A5A5A) matches the resting nav tabs below. */}
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0">
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {/* font-semibold (600), not font-black: Poppins is only loaded at 300-700, so 900
              would fall back to 700 or be synthetically emboldened. */}
          {!collapsed && <span className="text-sm font-semibold tracking-wide text-gray-500">Purchasing</span>}
        </div>
        {/* Logo stays visible when collapsed, just scaled down to fit the icon rail. */}
        <div className={`flex justify-center ${collapsed ? 'px-2 pt-2 pb-3' : 'px-5 pt-4 pb-4'}`}>
          <img src="/kimoel-logo.png" alt="Logo"
            className={`${collapsed ? 'h-10' : 'h-32'} w-auto object-contain transition-all duration-200`} />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button key={id} title={label} onClick={() => { setView(id); setMobileOpen(false); }}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span className="whitespace-nowrap">{label}</span>}
              {id === 'requests' && <NavBadge count={awaitingPOCount} collapsed={collapsed} />}
              {id === 'orders' && <NavBadge count={rejectedPOCount} collapsed={collapsed} />}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{(session.full_name || '?').charAt(0).toUpperCase()}</span></div>
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
      <AttentionCard items={[
        { label: 'Requests to raise a PO', count: awaitingPOCount, onView: () => setView('requests') },
        { label: 'Rejected orders to resubmit', count: rejectedPOCount, onView: () => setView('orders') },
      ]} />
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

          {view === 'withdrawals' && <WithdrawalTab fetchFn={pFetch} />}

          {view === 'requests' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search PR #, employee, project…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {/* No 'pending' option: those are still with Accounting and the server
                      does not return them to this role. */}
                  <option value="all">All statuses</option>
                  <option value="reviewed">Reviewed (needs admin verification)</option>
                  <option value="verified">Verified (needs purchase order)</option>
                  <option value="ordered">Ordered (awaiting admin approval)</option>
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
                            <p className="text-xs text-gray-400 mt-1">Prepared by <span className="text-gray-600 font-medium">{pr.employeeName || '—'}</span>{pr.checkedBy && <> · Checked by <span className="text-gray-600 font-medium">{pr.checkedBy}</span></>}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className={`text-xs font-semibold ${statusPill(pr.status)}`}>{statusLabel(pr.status)}</span>
                            {/* Sub-status hints are ambient text: same muted gray for every status. */}
                            {pr.status === 'reviewed' && <span className="text-[11px] text-gray-400">Awaiting admin verification</span>}
                            {pr.status === 'verified' && <span className="text-[11px] text-gray-400">Needs purchase order</span>}
                            {pr.status === 'ordered' && <span className="text-[11px] text-gray-400">Awaiting admin approval</span>}
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
                            {pr.status !== 'pending' && (
                              <button onClick={() => printCheckReport(pr)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                            )}
                            {pr.status === 'verified' && (
                              <button onClick={() => openCreatePO(pr)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><FileText className="w-3.5 h-3.5" /> Purchase Order</button>
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search PO #, supplier, PR #…" value={orderSearch} onChange={e => setOrderSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><FileText className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No purchase orders</p><p className="text-xs mt-1">Assign a supplier to a reviewed request to raise one.</p></div>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map(po => {
                      const state = orderState(po);
                      return (
                        <div key={po.id} className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900 text-sm">{po.poNumber}</h3>
                                {po.prNumber && <span className="text-xs text-gray-400">· for {po.prNumber}</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">Supplier <span className="text-gray-600 font-medium">{po.client || '—'}</span></p>
                              <p className="text-xs text-gray-400 mt-1">
                                Prepared by <span className="text-gray-600 font-medium">{po.preparedBy || '—'}</span>
                                {po.status === 'approved' && po.approvedBy && <> · Approved by <span className="text-gray-600 font-medium">{po.approvedBy}</span></>}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <span className="text-xs font-semibold text-brand-gold">{state.label}</span>
                              {state.hint && <span className="text-[11px] text-gray-400">{state.hint}</span>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                              {po.createdDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(po.createdDate).toLocaleDateString()}</span>}
                              {po.deliveryDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />delivery {new Date(po.deliveryDate).toLocaleDateString()}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900 mr-1">{peso(po.amount)}</span>
                              {po.status === 'rejected' && (
                                <button onClick={() => resubmitOrder(po)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><RefreshCw className="w-3.5 h-3.5" /> Resubmit</button>
                              )}
                              <button onClick={() => printOrder(po)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
          {view === 'suppliers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search name, address, TIN…" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <button onClick={() => { setEditingSupplier(null); setShowSupplierModal(true); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add Supplier</button>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filteredSuppliers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Factory className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No suppliers</p><p className="text-xs mt-1">Add one to assign it to a purchase request.</p></div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            <th className="px-4 py-3">Supplier</th>
                            <th className="px-4 py-3">Address</th>
                            <th className="px-4 py-3">Contact</th>
                            <th className="px-4 py-3">TIN</th>
                            <th className="px-4 py-3">Cert. of Reg.</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredSuppliers.map(s => (
                            <tr key={s.id}>
                              <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                              <td className="px-4 py-3 text-gray-600">{s.location || '—'}</td>
                              <td className="px-4 py-3 text-gray-600">{s.phone || '—'}</td>
                              <td className="px-4 py-3 text-gray-600">{s.tin || '—'}</td>
                              <td className="px-4 py-3">
                                {s.hasCertificate
                                  ? <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-gold"><Paperclip className="w-3 h-3" /> On file</span>
                                  : <span className="text-xs text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => { setEditingSupplier(s); setShowSupplierModal(true); }} title="Edit" className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => deleteSupplier(s)} title="Delete" className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </div>
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
          {view === 'new-pr' && <CreatePurchaseRequestForm fetchApi={pFetch} session={session} />}
        </main>
      </div>

      {viewing && (
        <DetailModal pr={viewing} onCreatePO={openCreatePO} onPrint={printCheckReport} onClose={() => setViewing(null)} />
      )}
      {creatingPOFor && (
        <PurchaseOrderModal pr={creatingPOFor} session={session} onClose={() => setCreatingPOFor(null)} onCreated={() => { setCreatingPOFor(null); loadAll(); }} />
      )}
      {showSupplierModal && (
        <SupplierModal initial={editingSupplier} onClose={() => setShowSupplierModal(false)}
          onSaved={() => { setShowSupplierModal(false); setEditingSupplier(null); loadAll(); }} />
      )}
    </div>
  );
}

export function PurchasingPortal() {
  useDocumentTitle('Purchasing');
  const [session, setSession] = useState<Session | null>(readSession());

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {session ? <Portal session={session} onSignOut={signOut} /> : <PurchasingLogin onLoggedIn={setSession} />}
    </ErrorBoundary>
  );
}
