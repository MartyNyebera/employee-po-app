import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck, PenTool, Menu, X, Search, Clock, Calendar, Printer, LogOut,
  Upload, Eraser, PackageCheck, PackageMinus, Plus, PanelLeftClose, PanelLeftOpen, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { printDeliveryReceipt } from '../lib/deliveryReceiptPrint';
import { ReceivingModal } from '../components/ReceivingModal';
import { NavBadge } from '../components/NavBadge';
import { AttentionCard } from '../components/AttentionCard';
import { CreatePurchaseRequestForm } from '../components/CreatePurchaseRequestForm';

// ============================================================================
// Logistics portal (/logistics). Fully independent of the admin dashboard: logistics staff
// sign in with a dedicated Logistics Account (created by an admin), using its OWN
// token/session — separate from every other portal's.
//
// OUTBOUND goods only (inbound receiving moved to the Warehouse — Section D #10):
//   Deliveries  — approved sales orders shipped to a customer, PLUS withdrawal-origin deliveries
//                 (Section D #15: a logistics stock withdrawal that an admin approved). Each is a
//                 `deliveries` row with a DR number; a withdrawal one has no sales order.
//   Withdrawals — logistics requests stock out of inventory to a typed destination. Once the
//                 warehouse releases it and an admin approves it, it auto-becomes a delivery above.
//
// Deliberately narrow — no drivers, vehicles or GPS. The previous fleet feature was removed
// wholesale and is not being rebuilt here.
// ============================================================================

type PortalView = 'new-pr' | 'deliveries' | 'withdrawals' | 'signature';

interface SalesOrder {
  id: string; soNumber: string; client: string; status: string;
  amount: number; createdDate?: string | null; deliveryDate?: string | null;
  customerAddress?: string | null; customerContact?: string | null;
}
interface Delivery {
  id: string; deliveryNumber: string; salesOrderId: string | null; status: string;
  dispatchedBy?: string | null; dispatchedAt?: string | null;
  deliveredAt?: string | null; receivedBy?: string | null; notes?: string | null;
  soNumber?: string | null; client?: string | null;
  customerAddress?: string | null; customerContact?: string | null;
  amount?: number | null; soStatus?: string | null; deliveryDate?: string | null;
  // Section D — #15: set on a withdrawal-origin delivery (no sales order behind it).
  withdrawalId?: string | null; destination?: string | null;
  items?: { itemName: string; quantity: number; unit?: string | null }[] | null;
}
// Minimal shape for the withdrawal item-picker.
interface InventoryItem { id: string; itemName: string; unit?: string | null; quantity: number; }
// A withdrawal this logistics account requested. `destination` is always set (that's what makes
// it a logistics withdrawal that becomes a delivery).
interface WithdrawalRequest {
  id: string; withdrawalNumber?: string | null; itemName?: string | null;
  quantity: number; unit?: string | null; reason?: string | null; destination?: string | null;
  status: 'pending' | 'warehouse-approved' | 'approved' | 'rejected';
  warehouseBy?: string | null; reviewedBy?: string | null; createdAt?: string;
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

// A job is one approved sales order plus its delivery record, if it has one yet.
interface Job {
  so: SalesOrder;
  delivery: Delivery | null;
  state: 'pending' | 'dispatched' | 'delivered' | 'cancelled';
}

const WD_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting warehouse',
  'warehouse-approved': 'Awaiting admin',
  approved: 'Approved — in deliveries',
  rejected: 'Rejected',
};

const TOKEN_KEY = 'logistics_token';
const SESSION_KEY = 'logistics_session';

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (s: string) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

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
// Portal shell
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('deliveries');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Job | null>(null);
  // A withdrawal-origin delivery being marked delivered (no sales order behind it).
  const [completingDelivery, setCompletingDelivery] = useState<Delivery | null>(null);
  const [requesting, setRequesting] = useState(false);

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [sos, dels, wds, inv, sig] = await Promise.all([
        lFetch<SalesOrder[]>('/sales-orders'),
        lFetch<Delivery[]>('/deliveries'),
        // Only this account's own withdrawals — the destination-carrying logistics ones.
        lFetch<WithdrawalRequest[]>('/inventory-withdrawals/mine').catch(() => []),
        lFetch<InventoryItem[]>('/inventory').catch(() => []),
        lFetch<{ signature: string | null }>('/logistics/signature'),
      ]);
      setOrders(sos || []);
      setDeliveries(dels || []);
      setWithdrawals(wds || []);
      setInventory(inv || []);
      setSignature(sig?.signature || null);
    } catch (e: any) {
      if (String(e.message).includes('session expired')) { onSignOut(); return; }
      if (!silent) toast.error(e.message || 'Failed to load deliveries');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  // Paused while a delivery is in flight or any modal is open.
  useLiveRefresh(() => loadAll({ silent: true }), { enabled: !busyId && !completing && !completingDelivery && !requesting });

  // Only approved sales orders are dispatchable, so the job list is those joined to their
  // delivery record (if any). An order with no row is implicitly pending.
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

  // Section D — #15: withdrawal-origin deliveries — a deliveries row with no sales order, created
  // when an admin approved a logistics withdrawal. Dispatched/delivered with the same flow.
  const withdrawalDeliveries = useMemo(
    () => deliveries.filter(d => d.withdrawalId && d.status !== 'cancelled'),
    [deliveries],
  );

  const filtered = useMemo(() => jobs.filter(j => {
    const q = search.toLowerCase();
    return !q || j.so.soNumber.toLowerCase().includes(q) || (j.so.client || '').toLowerCase().includes(q)
      || (j.delivery?.deliveryNumber || '').toLowerCase().includes(q);
  }), [jobs, search]);

  const filteredWD = useMemo(() => withdrawalDeliveries.filter(d => {
    const q = search.toLowerCase();
    return !q || (d.deliveryNumber || '').toLowerCase().includes(q) || (d.destination || '').toLowerCase().includes(q);
  }), [withdrawalDeliveries, search]);

  const pendingCount = jobs.filter(j => j.state === 'pending').length
    + withdrawalDeliveries.filter(d => d.status === 'pending').length;

  const dispatch = async (job: Job) => {
    setBusyId(job.so.id);
    try {
      const d = await lFetch<Delivery>('/deliveries', { method: 'POST', body: JSON.stringify({ salesOrderId: job.so.id }) });
      toast.success(`${job.so.soNumber} dispatched as ${d.deliveryNumber}`);
      loadAll();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  // A withdrawal-origin delivery already exists (auto-created 'pending'), so dispatch flips it
  // pending -> dispatched via PUT rather than creating a new row.
  const dispatchWithdrawal = async (d: Delivery) => {
    setBusyId(d.id);
    try {
      await lFetch(`/deliveries/${d.id}`, { method: 'PUT', body: JSON.stringify({ status: 'dispatched' }) });
      toast.success(`${d.deliveryNumber} dispatched`);
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

  // Section D — #15: receipt for a withdrawal-origin delivery — the destination stands in for
  // the customer, and the withdrawn line is spelled out in the notes.
  const printWD = (d: Delivery) => {
    const item = d.items?.[0];
    const r = printDeliveryReceipt({
      deliveryNumber: d.deliveryNumber, status: d.status, soNumber: null,
      client: d.destination || '—', customerAddress: null, customerContact: null, amount: null,
      dispatchedBy: d.dispatchedBy, dispatchedAt: d.dispatchedAt, deliveredAt: d.deliveredAt,
      receivedBy: d.receivedBy,
      notes: item ? `${item.quantity} ${item.unit || ''} ${item.itemName}${d.notes ? ' — ' + d.notes : ''}` : d.notes,
    });
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  const requestWithdrawal = async (inventoryId: string, quantity: number, destination: string, reason: string | null) => {
    await lFetch(`/inventory/${inventoryId}/withdraw`, { method: 'POST', body: JSON.stringify({ quantity, destination, reason }) });
    toast.success('Withdrawal requested — the warehouse releases it, then an admin approves');
    loadAll();
  };

  const NAV: { id: PortalView; label: string; icon: any; badge?: number }[] = [
    { id: 'new-pr', label: 'New Purchase Request', icon: FileText },
    { id: 'deliveries', label: 'Deliveries', icon: Truck, badge: pendingCount },
    { id: 'withdrawals', label: 'Withdrawals', icon: PackageMinus },
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
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span className="whitespace-nowrap">{label}</span>}
              <NavBadge count={badge || 0} collapsed={collapsed} />
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
      <AttentionCard items={[
        { label: 'Deliveries to dispatch/complete', count: pendingCount, onView: () => setView('deliveries') },
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

          {view === 'deliveries' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search SO #, DR #, client…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : (filtered.length === 0 && filteredWD.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Truck className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">Nothing to deliver</p><p className="text-xs mt-1">Approved sales orders and approved stock withdrawals appear here.</p></div>
                ) : (
                  <>
                  {filteredWD.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Withdrawal deliveries</h3>
                      {filteredWD.map(d => {
                        const item = d.items?.[0];
                        return (
                          <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-gray-900 text-sm">{d.deliveryNumber}</h3>
                                  {item && <span className="text-xs text-gray-400">· {item.quantity} {item.unit || ''} {item.itemName}</span>}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">Deliver to <span className="text-gray-600 font-medium">{d.destination || '—'}</span></p>
                                {d.status === 'delivered' && <p className="text-xs text-gray-400 mt-1">Received by <span className="text-gray-600 font-medium">{d.receivedBy || '—'}</span></p>}
                              </div>
                              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                <span className="text-xs font-semibold text-brand-gold">{statusLabel(d.status)}</span>
                                {d.status === 'pending' && <span className="text-[11px] text-gray-400">Ready to dispatch</span>}
                                {d.status === 'dispatched' && <span className="text-[11px] text-gray-400">Out for delivery</span>}
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                              {d.status === 'pending' && (
                                <button onClick={() => dispatchWithdrawal(d)} disabled={busyId === d.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><Truck className="w-3.5 h-3.5" /> Dispatch</button>
                              )}
                              {d.status === 'dispatched' && (
                                <button onClick={() => setCompletingDelivery(d)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><PackageCheck className="w-3.5 h-3.5" /> Mark Delivered</button>
                              )}
                              <button onClick={() => printWD(d)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Receipt</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {filtered.length > 0 && (
                  <div className="space-y-3">
                    {filteredWD.length > 0 && <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sales-order deliveries</h3>}
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
                            {job.delivery && (
                              <button onClick={() => print(job)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Receipt</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                  </>
                )}
            </div>
          )}

          {view === 'withdrawals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-gray-900">Stock Withdrawals</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Request stock out of inventory to a destination. The warehouse releases it, an admin approves, and it then appears under Deliveries.</p>
                </div>
                <button onClick={() => setRequesting(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"><Plus className="w-4 h-4" /> Request withdrawal</button>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : withdrawals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><PackageMinus className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No withdrawals yet</p><p className="text-xs mt-1">Request one to move stock to a site.</p></div>
                ) : (
                  <div className="space-y-3">
                    {withdrawals.map(w => (
                      <div key={w.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{w.withdrawalNumber || '—'}</h3>
                              <span className="text-xs text-gray-400">{w.quantity} {w.unit || ''} · {w.itemName}</span>
                            </div>
                            {w.destination && <p className="text-xs text-gray-400 mt-0.5">To <span className="text-gray-600 font-medium">{w.destination}</span></p>}
                            {w.reason && <p className="text-xs text-gray-400 mt-0.5">{w.reason}</p>}
                          </div>
                          <span className="flex-shrink-0 text-xs font-semibold text-brand-gold">{WD_STATUS_LABEL[w.status] || w.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
          {view === 'new-pr' && <CreatePurchaseRequestForm fetchApi={lFetch} session={session} />}
        </main>
      </div>

      {completing && (
        <ReceivingModal
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

      {/* Section D — #15: completing a withdrawal-origin delivery. */}
      {completingDelivery && (
        <ReceivingModal
          subtitle={`${completingDelivery.deliveryNumber} · to ${completingDelivery.destination || '—'}`}
          initialNotes={completingDelivery.notes}
          onSave={async (receivedBy, notes) => {
            await lFetch(`/deliveries/${completingDelivery.id}`, {
              method: 'PUT', body: JSON.stringify({ status: 'delivered', receivedBy, notes }),
            });
            toast.success(`${completingDelivery.deliveryNumber} marked delivered`);
            printWD({ ...completingDelivery, status: 'delivered', receivedBy, notes });
          }}
          onClose={() => setCompletingDelivery(null)}
          onDone={() => { setCompletingDelivery(null); loadAll(); }}
        />
      )}

      {/* Section D — #5: request a stock withdrawal to a destination. */}
      {requesting && (
        <WithdrawalRequestModal
          inventory={inventory}
          onSubmit={requestWithdrawal}
          onClose={() => setRequesting(false)}
          onDone={() => setRequesting(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Request a stock withdrawal (Section D — #5). Logistics picks an inventory item, a quantity,
// and a destination (required — that is what turns the approved withdrawal into a delivery).
// ============================================================================
function WithdrawalRequestModal({ inventory, onSubmit, onClose, onDone }: {
  inventory: InventoryItem[];
  onSubmit: (inventoryId: string, quantity: number, destination: string, reason: string | null) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const picked = inventory.find(i => i.id === inventoryId);

  const submit = async () => {
    const qty = Number(quantity);
    if (!inventoryId) { toast.error('Pick an item'); return; }
    if (!qty || qty <= 0) { toast.error('Enter a quantity'); return; }
    if (picked && qty > picked.quantity) { toast.error(`Only ${picked.quantity} ${picked.unit || ''} in stock`); return; }
    if (!destination.trim()) { toast.error('A destination is required'); return; }
    setSaving(true);
    try { await onSubmit(inventoryId, qty, destination.trim(), reason.trim() || null); onDone(); }
    catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Request withdrawal</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item <span className="text-red-500">*</span></label>
            <select value={inventoryId} onChange={e => setInventoryId(e.target.value)} className={input}>
              <option value="">Select an item…</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.itemName} ({i.quantity} {i.unit || ''} in stock)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className={input} placeholder={picked ? `up to ${picked.quantity}` : ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destination <span className="text-red-500">*</span></label>
            <input value={destination} onChange={e => setDestination(e.target.value)} className={input} placeholder="Where it is being delivered" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={input} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><PackageMinus className="w-4 h-4" /> {saving ? 'Requesting…' : 'Request'}</button>
        </div>
      </div>
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
