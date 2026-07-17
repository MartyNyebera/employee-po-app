import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck, PenTool, Menu, X, Search, Clock, Calendar, Printer, LogOut,
  Upload, Eraser, PackageCheck, FileText, Ban, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { printDeliveryReceipt, printReceivingReport, type ReceivedLine } from '../lib/deliveryReceiptPrint';
import { printPurchaseOrder } from '../lib/orderPrint';

// ============================================================================
// Logistics portal (/logistics). Fully independent of the admin dashboard: logistics staff
// sign in with a dedicated Logistics Account (created by an admin), using its OWN
// token/session — separate from every other portal's.
//
// Two directions of goods, one per tab, deliberately kept apart:
//   Deliveries      — OUTBOUND. Approved sales orders we ship to a customer; each gets its
//                     own `deliveries` row and DR number.
//   Purchase Orders — INBOUND. Orders an admin approved, arriving from a supplier. Tracked on
//                     the order's OWN status (approved -> in-progress -> RECEIVED/cancelled)
//                     rather than a delivery record — RECEIVED is what the Business Overview
//                     counts as an expense, so it has to live on the order itself.
//
// Deliberately narrow — no drivers, vehicles or GPS. The previous fleet feature was removed
// wholesale and is not being rebuilt here.
// ============================================================================

type PortalView = 'deliveries' | 'orders' | 'signature';

interface SalesOrder {
  id: string; soNumber: string; client: string; status: string;
  amount: number; createdDate?: string | null; deliveryDate?: string | null;
  customerAddress?: string | null; customerContact?: string | null;
}
// Inbound order from a supplier. `client` holds the supplier name (the column is shared with
// sales orders). The server only ever sends Logistics approved-and-beyond orders.
interface PurchaseOrder {
  id: string; poNumber: string; client: string; status: string; amount: number;
  description?: string | null; createdDate?: string | null; deliveryDate?: string | null;
  docDate?: string | null; supplierAddress?: string | null; supplierContact?: string | null;
  supplierTin?: string | null; preparedBy?: string | null; reviewedBy?: string | null;
  paymentTerms?: string | null; termsAndConditions?: string | null;
  prNumber?: string | null; prStatus?: string | null;
  approvedBy?: string | null; approvedAt?: string | null;
  inTransitAt?: string | null; inTransitBy?: string | null;
  receivedAt?: string | null; receivedBy?: string | null;
  cancelledAt?: string | null; cancelledBy?: string | null; deliveryNotes?: string | null;
  // What went onto the shelf when this was received — recorded at that moment, so the
  // delivery receipt can be reprinted. null means the receipt predates the record, which the
  // document reports as "not recorded" rather than as "nothing was added".
  receivedLines?: ReceivedLine[] | null;
}
interface Delivery {
  id: string; deliveryNumber: string; salesOrderId: string | null; status: string;
  dispatchedBy?: string | null; dispatchedAt?: string | null;
  deliveredAt?: string | null; receivedBy?: string | null; notes?: string | null;
  soNumber?: string | null; client?: string | null;
  customerAddress?: string | null; customerContact?: string | null;
  amount?: number | null; soStatus?: string | null; deliveryDate?: string | null;
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

// A job is one approved sales order plus its delivery record, if it has one yet.
interface Job {
  so: SalesOrder;
  delivery: Delivery | null;
  state: 'pending' | 'dispatched' | 'delivered' | 'cancelled';
}

const TOKEN_KEY = 'logistics_token';
const SESSION_KEY = 'logistics_session';

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (s: string) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

// A purchase order's raw status is storage-shaped ('in-progress', 'RECEIVED') and reads badly
// on screen. `hint` says what Logistics is expected to do next, matching the Deliveries tab.
const poState = (s: string): { label: string; hint: string | null } => {
  if (s === 'approved') return { label: 'Ready', hint: 'Awaiting delivery' };
  if (s === 'in-progress') return { label: 'Ongoing delivery', hint: 'In transit from supplier' };
  if (s === 'RECEIVED') return { label: 'Delivered', hint: null };
  if (s === 'cancelled') return { label: 'Cancelled', hint: null };
  return { label: statusLabel(s), hint: null };
};

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// Logistics-authed fetch (sends logistics_token).
async function lFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
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
// Login (its own endpoint — /api/logistics/login)
// ============================================================================
function LogisticsLogin({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/logistics/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.logistics));
      onLoggedIn(data.logistics);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-4">
          <img src="/kimoel-logo.png" alt="Kimoel" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Logistics</h1>
            <p className="text-sm text-gray-500">Sign in with your logistics account</p>
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
// Signature pad (draw or upload) — saved as a data-URL to the logistics account
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
      const res = await lFetch<{ signature: string }>('/logistics/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      onSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">My e-signature</h2>
        <p className="text-sm text-gray-500 mt-0.5">Saved to your logistics account for signing off dispatch paperwork. Draw below or upload an image.</p>
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
// Record who took receipt of something. Shared by BOTH tabs — an outbound delivery and an
// inbound purchase order ask the identical question, so `onSave` carries the difference
// rather than a second near-identical modal.
// ============================================================================
function DeliveredModal({ subtitle, initialNotes, onSave, onClose, onDone }: {
  subtitle: string;
  initialNotes?: string | null;
  onSave: (receivedBy: string, notes: string | null) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState(initialNotes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!receivedBy.trim()) { toast.error('Who received the delivery?'); return; }
    setSaving(true);
    try {
      await onSave(receivedBy.trim(), notes.trim() || null);
      onDone();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mark Delivered</h2>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Received by <span className="text-red-500">*</span></label>
            <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Name of the person who received it" className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={input} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><PackageCheck className="w-4 h-4" /> {saving ? 'Saving…' : 'Mark Delivered'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Portal shell
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('deliveries');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Job | null>(null);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      // The server scopes /purchase-orders to approved-and-beyond for the logistics role, so
      // no client-side filter is needed here — pending orders never reach this browser.
      const [sos, dels, pos, sig] = await Promise.all([
        lFetch<SalesOrder[]>('/sales-orders'),
        lFetch<Delivery[]>('/deliveries'),
        lFetch<PurchaseOrder[]>('/purchase-orders'),
        lFetch<{ signature: string | null }>('/logistics/signature'),
      ]);
      setOrders(sos || []);
      setDeliveries(dels || []);
      setPurchaseOrders(pos || []);
      setSignature(sig?.signature || null);
    } catch (e: any) {
      if (String(e.message).includes('session expired')) { onSignOut(); return; }
      if (!silent) toast.error(e.message || 'Failed to load deliveries');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  // Paused while a delivery is in flight or a complete/receive modal is open.
  useLiveRefresh(() => loadAll({ silent: true }), { enabled: !busyId && !completing && !receivingPO });

  // Only approved orders are dispatchable, so the job list is those joined to their delivery
  // record (if any). An order with no row is implicitly pending.
  const jobs = useMemo<Job[]>(() => {
    const byOrder = new Map<string, Delivery>();
    for (const d of deliveries) {
      if (d.salesOrderId && d.status !== 'cancelled') byOrder.set(d.salesOrderId, d);
    }
    return orders
      .filter(so => so.status === 'approved')
      .map(so => {
        const delivery = byOrder.get(so.id) || null;
        const state = (delivery?.status as Job['state']) || 'pending';
        return { so, delivery, state };
      });
  }, [orders, deliveries]);

  const filtered = useMemo(() => jobs.filter(j => {
    const q = search.toLowerCase();
    return !q || j.so.soNumber.toLowerCase().includes(q) || (j.so.client || '').toLowerCase().includes(q)
      || (j.delivery?.deliveryNumber || '').toLowerCase().includes(q);
  }), [jobs, search]);

  const pendingCount = jobs.filter(j => j.state === 'pending').length;

  // ---- Inbound purchase orders -------------------------------------------------------
  const filteredPOs = useMemo(() => purchaseOrders.filter(po => {
    const q = search.toLowerCase();
    return !q || po.poNumber.toLowerCase().includes(q) || (po.client || '').toLowerCase().includes(q)
      || (po.prNumber || '').toLowerCase().includes(q);
  }), [purchaseOrders, search]);

  // Actionable = still needs a confirmation from Logistics. RECEIVED/cancelled are terminal.
  const openPOCount = purchaseOrders.filter(po => po.status === 'approved' || po.status === 'in-progress').length;

  const setPODelivery = async (po: PurchaseOrder, status: 'in-progress' | 'cancelled') => {
    if (status === 'cancelled' && !(await confirmDialog({ title: `Cancel ${po.poNumber}?`, message: 'This cannot be undone. The purchase request stays approved.', confirmLabel: 'Cancel order', tone: 'danger' }))) return;
    setBusyId(po.id);
    try {
      await lFetch(`/purchase-orders/${po.id}/delivery`, { method: 'PUT', body: JSON.stringify({ status }) });
      toast.success(status === 'in-progress' ? `${po.poNumber} marked as an ongoing delivery` : `${po.poNumber} cancelled`);
      loadAll();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  const printPO = async (po: PurchaseOrder) => {
    const r = await printPurchaseOrder(po as any, () => lFetch(`/purchase-orders/${po.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  // The inbound delivery receipt. One function for both the auto-open on Mark Delivered and
  // the Print Receipt button, so a reprint is byte-for-byte the document that opened at the
  // time — `lines` is the only difference: fresh from the PUT response, or from the stored
  // received_lines afterwards. Passing `undefined` (not []) for an unrecorded legacy receipt
  // is what makes the document say "not recorded" instead of "nothing was added".
  const printPOReceipt = (po: PurchaseOrder, lines?: ReceivedLine[] | null, receivedBy?: string, receivedAt?: string, notes?: string | null) => {
    const p = printReceivingReport({
      poNumber: po.poNumber,
      supplier: po.client,
      supplierAddress: po.supplierAddress,
      supplierContact: po.supplierContact,
      prNumber: po.prNumber,
      amount: po.amount,
      receivedBy: receivedBy ?? po.receivedBy ?? '',
      receivedAt: receivedAt ?? po.receivedAt ?? undefined,
      notes: notes ?? po.deliveryNotes,
      items: lines,
    });
    if (!p.ok) toast.error(p.error || 'Failed to open the print window');
    return p;
  };

  const dispatch = async (job: Job) => {
    setBusyId(job.so.id);
    try {
      const d = await lFetch<Delivery>('/deliveries', { method: 'POST', body: JSON.stringify({ salesOrderId: job.so.id }) });
      toast.success(`${job.so.soNumber} dispatched as ${d.deliveryNumber}`);
      loadAll();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  const print = (job: Job) => {
    if (!job.delivery) return;
    const r = printDeliveryReceipt({
      ...job.delivery,
      client: job.delivery.client ?? job.so.client,
      customerAddress: job.delivery.customerAddress ?? job.so.customerAddress,
      customerContact: job.delivery.customerContact ?? job.so.customerContact,
      amount: job.delivery.amount ?? job.so.amount,
    });
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  // FileText for purchase orders, matching what the Purchasing portal already uses for them.
  const NAV: { id: PortalView; label: string; icon: any; badge?: number }[] = [
    { id: 'deliveries', label: 'Deliveries', icon: Truck, badge: pendingCount },
    { id: 'orders', label: 'Purchase Orders', icon: FileText, badge: openPOCount },
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
          {!collapsed && <span className="text-sm font-semibold tracking-wide text-gray-500">Logistics</span>}
        </div>
        <div className={`flex justify-center ${collapsed ? 'px-2 pt-2 pb-3' : 'px-5 pt-4 pb-4'}`}>
          <img src="/kimoel-logo.png" alt="Logo" className={`${collapsed ? 'h-10' : 'h-32'} w-auto object-contain transition-all duration-200`} />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon, badge }) => {
          const active = view === id;
          return (
            <button key={id} title={label} onClick={() => { setView(id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>{label}</span>}
              {!collapsed && !!badge && <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-yellow-100 text-yellow-700'}`}>{badge}</span>}
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

          {view === 'deliveries' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search SO #, DR #, customer…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Truck className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">Nothing to deliver</p><p className="text-xs mt-1">Sales orders appear here once an admin approves them.</p></div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map(job => (
                      <div key={job.so.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{job.so.soNumber}</h3>
                              {job.delivery && <span className="text-xs text-gray-400">· {job.delivery.deliveryNumber}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">Deliver to <span className="text-gray-600 font-medium">{job.so.client || '—'}</span></p>
                            {job.so.customerAddress && <p className="text-xs text-gray-400 mt-0.5">{job.so.customerAddress}</p>}
                            {job.state === 'delivered' && (
                              <p className="text-xs text-gray-400 mt-1">Received by <span className="text-gray-600 font-medium">{job.delivery?.receivedBy || '—'}</span></p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className="text-xs font-semibold text-brand-gold">{statusLabel(job.state)}</span>
                            {job.state === 'pending' && <span className="text-[11px] text-gray-400">Ready to dispatch</span>}
                            {job.state === 'dispatched' && <span className="text-[11px] text-gray-400">Out for delivery</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {job.so.deliveryDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />due {new Date(job.so.deliveryDate).toLocaleDateString()}</span>}
                            {job.delivery?.dispatchedAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />dispatched {new Date(job.delivery.dispatchedAt).toLocaleDateString()}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 mr-1">{peso(job.so.amount)}</span>
                            {job.state === 'pending' && (
                              <button onClick={() => dispatch(job)} disabled={busyId === job.so.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><Truck className="w-3.5 h-3.5" /> Dispatch</button>
                            )}
                            {job.state === 'dispatched' && (
                              <button onClick={() => setCompleting(job)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><PackageCheck className="w-3.5 h-3.5" /> Mark Delivered</button>
                            )}
                            {/* "Receipt", not "Print": this is the delivery receipt, and the
                                Purchase Orders tab uses Print for the order itself. */}
                            {job.delivery && (
                              <button onClick={() => print(job)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Receipt</button>
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
                <input type="text" placeholder="Search PO #, supplier, PR #…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filteredPOs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><FileText className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No purchase orders</p><p className="text-xs mt-1">Orders appear here once an admin approves them.</p></div>
                ) : (
                  <div className="space-y-3">
                    {filteredPOs.map(po => {
                      const st = poState(po.status);
                      const open = po.status === 'approved' || po.status === 'in-progress';
                      return (
                        <div key={po.id} className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900 text-sm">{po.poNumber}</h3>
                                {po.prNumber && <span className="text-xs text-gray-400">· for {po.prNumber}</span>}
                              </div>
                              {/* `client` is the supplier on a purchase order — the column is shared with sales orders. */}
                              <p className="text-xs text-gray-400 mt-0.5">From <span className="text-gray-600 font-medium">{po.client || '—'}</span></p>
                              {po.supplierAddress && <p className="text-xs text-gray-400 mt-0.5">{po.supplierAddress}</p>}
                              {po.status === 'RECEIVED' && (
                                <p className="text-xs text-gray-400 mt-1">Received by <span className="text-gray-600 font-medium">{po.receivedBy || '—'}</span></p>
                              )}
                              {po.status === 'cancelled' && po.cancelledBy && (
                                <p className="text-xs text-gray-400 mt-1">Cancelled by <span className="text-gray-600 font-medium">{po.cancelledBy}</span></p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <span className="text-xs font-semibold text-brand-gold">{st.label}</span>
                              {st.hint && <span className="text-[11px] text-gray-400">{st.hint}</span>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                              {po.deliveryDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />due {new Date(po.deliveryDate).toLocaleDateString()}</span>}
                              {po.inTransitAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />ongoing {new Date(po.inTransitAt).toLocaleDateString()}</span>}
                              {po.receivedAt && <span className="flex items-center gap-1"><PackageCheck className="w-3 h-3" />received {new Date(po.receivedAt).toLocaleDateString()}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900 mr-1">{peso(po.amount)}</span>
                              {po.status === 'approved' && (
                                <button onClick={() => setPODelivery(po, 'in-progress')} disabled={busyId === po.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><Truck className="w-3.5 h-3.5" /> Mark Ongoing</button>
                              )}
                              {open && (
                                <button onClick={() => setReceivingPO(po)} disabled={busyId === po.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><PackageCheck className="w-3.5 h-3.5" /> Mark Delivered</button>
                              )}
                              {open && (
                                <button onClick={() => setPODelivery(po, 'cancelled')} disabled={busyId === po.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><Ban className="w-3.5 h-3.5" /> Cancel</button>
                              )}
                              {/* Only a received order has a delivery receipt to give. Reprintable
                                  from here for good — it used to exist solely as the popup that
                                  opened once on Mark Delivered, and was gone once closed. */}
                              {po.status === 'RECEIVED' && (
                                <button onClick={() => printPOReceipt(po, po.receivedLines)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><PackageCheck className="w-3.5 h-3.5" /> Receipt</button>
                              )}
                              <button onClick={() => printPO(po)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </main>
      </div>

      {completing && (
        <DeliveredModal
          subtitle={`${completing.delivery?.deliveryNumber} · ${completing.so.soNumber} · ${completing.so.client}`}
          initialNotes={completing.delivery?.notes}
          onSave={async (receivedBy, notes) => {
            const d = await lFetch<Delivery>(`/deliveries/${completing.delivery!.id}`, {
              method: 'PUT',
              body: JSON.stringify({ status: 'delivered', receivedBy, notes }),
            });
            toast.success(`${completing.so.soNumber} marked delivered`);
            // The receipt is the point of finishing a delivery — open it rather than making
            // them find the Print button. A blocked popup is a warning, never a lost delivery:
            // the state change already committed and Print is still there.
            const r = printDeliveryReceipt({
              ...completing.delivery!, ...d,
              client: completing.so.client,
              customerAddress: completing.so.customerAddress,
              customerContact: completing.so.customerContact,
              amount: completing.so.amount,
              receivedBy, notes,
              status: 'delivered',
            });
            if (!r.ok) toast.error(r.error || 'Delivery recorded — allow popups to print the receipt');
          }}
          onClose={() => setCompleting(null)}
          onDone={() => { setCompleting(null); loadAll(); }}
        />
      )}

      {receivingPO && (
        <DeliveredModal
          subtitle={`${receivingPO.poNumber} · from ${receivingPO.client}`}
          initialNotes={receivingPO.deliveryNotes}
          onSave={async (receivedBy, notes) => {
            const r = await lFetch<{ receivedAt?: string; inventoryApplied?: { itemName: string; added: number; newQuantity: number }[] }>(
              `/purchase-orders/${receivingPO.id}/delivery`,
              { method: 'PUT', body: JSON.stringify({ status: 'RECEIVED', receivedBy, notes }) },
            );
            // Say what moved. Receiving silently would leave the user unsure whether stock
            // went up — and an order with no inventory lines (a hand-raised one) adds nothing.
            const n = r.inventoryApplied?.length || 0;
            toast.success(
              n ? `${receivingPO.poNumber} received — ${n} item${n > 1 ? 's' : ''} added to inventory`
                : `${receivingPO.poNumber} marked delivered`,
            );
            // Auto-open the delivery receipt, listing exactly what went onto the shelf. It is
            // no longer the only chance to see it — the same document is behind Receipt on the
            // row from now on — but opening it here still saves a click at the moment it matters.
            const p = printPOReceipt(receivingPO, r.inventoryApplied || [], receivedBy, r.receivedAt || new Date().toISOString(), notes);
            if (!p.ok) toast.error(p.error || 'Receipt recorded — allow popups, then use Receipt on the row');
          }}
          onClose={() => setReceivingPO(null)}
          onDone={() => { setReceivingPO(null); loadAll(); }}
        />
      )}
    </div>
  );
}

export function LogisticsPortal() {
  const [session, setSession] = useState<Session | null>(readSession());
  useDocumentTitle('Logistics');

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {session ? <Portal session={session} onSignOut={signOut} /> : <LogisticsLogin onLoggedIn={setSession} />}
    </ErrorBoundary>
  );
}
