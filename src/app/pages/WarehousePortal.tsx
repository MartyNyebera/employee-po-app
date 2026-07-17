import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu, X, Search, LogOut, Package, Plus, Pencil, Boxes, ClipboardList, Check, PackageMinus,
  PanelLeftClose, PanelLeftOpen, PenTool, Eraser, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

// ============================================================================
// Warehouse portal (/warehouse). Fully independent of the admin dashboard:
// warehouse staff sign in here with a dedicated Warehouse Account (created by an
// admin), using its OWN token/session — separate from admin `fleet_auth` and the
// employee/purchasing tokens. They input new inventory items and update stock.
// Items entered here feed inventory management and purchase-request selection.
// ============================================================================

type PortalView = 'inventory' | 'itemRequests' | 'withdrawals' | 'signature';

interface InventoryItem {
  id: string; itemCode: string; itemName: string; description?: string;
  quantity: number; unit: string; unitCost?: number; reorderLevel?: number;
  location?: string; supplier?: string;
}
// Production can only put items on a purchase request that already exist in inventory, so
// this is how they ask for one that doesn't. Accepting creates the item — see the review
// route, which does both in a single transaction.
interface ItemRequest {
  id: string; requestNumber?: string | null; itemName: string; description?: string | null;
  unit?: string | null; reason?: string | null; status: 'pending' | 'approved' | 'rejected';
  requestedByName?: string | null; reviewedBy?: string | null; reviewedAt?: string | null;
  inventoryId?: string | null; itemCode?: string | null; createdAt?: string;
}
// Production asks for stock; the warehouse confirms it is physically on the shelf and releases
// it; the admin then authorises, and only that last step deducts. Nothing here moves stock.
interface WithdrawalRequest {
  id: string; withdrawalNumber?: string | null; itemName?: string | null;
  quantity: number; unit?: string | null; reason?: string | null;
  requestedByName?: string | null; prNumber?: string | null;
  status: 'pending' | 'warehouse-approved' | 'approved' | 'rejected';
  warehouseBy?: string | null; warehouseAt?: string | null;
  reviewedBy?: string | null; reviewedAt?: string | null; createdAt?: string;
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

const WD_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting you',
  'warehouse-approved': 'Awaiting admin',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TOKEN_KEY = 'warehouse_token';
const SESSION_KEY = 'warehouse_session';

const UNITS = ['pcs', 'pieces', 'bags', 'kg', 'liters', 'meters', 'boxes', 'sets', 'Lot', 'units'];

// Plain brand-gold text, no pill — the same treatment purchase-request statuses get in every
// other portal. The words carry the meaning; the quantity beside them carries the detail.
const stockStatus = (it: InventoryItem): { label: string; cls: string } => {
  const qty = Number(it.quantity) || 0;
  const reorder = Number(it.reorderLevel ?? 10);
  const cls = 'text-brand-gold';
  if (qty <= 0) return { label: 'Out of stock', cls };
  if (qty <= reorder) return { label: 'Low stock', cls };
  return { label: 'In stock', cls };
};

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// Warehouse-authed fetch (sends warehouse_token). Distinct from admin client.ts and other portals.
async function wFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
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
// Login (its own endpoint — /api/warehouse/login)
// ============================================================================
function WarehouseLogin({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/warehouse/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.warehouse));
      onLoggedIn(data.warehouse);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-4">
          <img src="/kimoel-logo.png" alt="Kimoel" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Warehouse</h1>
            <p className="text-sm text-gray-500">Sign in with your warehouse account</p>
          </div>
        </div>
        <form onSubmit={submit} className="p-8 pt-2 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-xs text-gray-400 text-center">No account? Ask your admin to create one for you.</p>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Add-item modal — creates a new inventory item (name, unit, initial qty).
// The item code is assigned by the server (ITM-YYYY-NNNN): it is NOT NULL UNIQUE, and
// asking staff to invent one meant a typo collided with an existing item.
// ============================================================================
// `initial` prefills the form; `save` overrides where the item gets created. Accepting an item
// request goes through the review route instead of POST /inventory, because that route creates
// the item AND marks the request approved in one transaction — two calls would strand an item
// whenever the second failed, and the retry would create a duplicate.
function AddItemModal({ onClose, onSaved, title, subtitle, initial, save: saveOverride }: {
  onClose: () => void;
  onSaved: () => void;
  title?: string;
  subtitle?: string;
  initial?: { itemName?: string; unit?: string };
  save?: (f: { itemName: string; unit: string; quantity: number }) => Promise<void>;
}) {
  const [f, setF] = useState({ itemName: initial?.itemName || '', unit: initial?.unit || 'pcs', quantity: '0' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.itemName.trim()) { toast.error('Item name is required'); return; }
    setSaving(true);
    try {
      const body = { itemName: f.itemName.trim(), unit: f.unit, quantity: Number(f.quantity) || 0 };
      if (saveOverride) {
        await saveOverride(body);
      } else {
        // No itemCode in the body — that absence is what triggers server-side generation.
        const created = await wFetch<InventoryItem>('/inventory', { method: 'POST', body: JSON.stringify(body) });
        toast.success(`Item added as ${created.itemCode}`);
      }
      onSaved();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-900">{title || 'New Inventory Item'}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input value={f.itemName} onChange={e => set('itemName', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={f.unit} onChange={e => set('unit', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starting Qty</label>
              <input type="number" min="0" value={f.quantity} onChange={e => set('quantity', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <p className="text-xs text-gray-400">An item code is assigned automatically when you save.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">{saving ? 'Saving…' : 'Add Item'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Update-item modal — adjusts stock and details (item code is immutable)
// ============================================================================
function UpdateItemModal({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    quantity: String(item.quantity ?? 0), unit: item.unit || 'pcs',
    unitCost: String(item.unitCost ?? 0), reorderLevel: String(item.reorderLevel ?? 10),
    location: item.location || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await wFetch(`/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({
        quantity: Number(f.quantity) || 0, unit: f.unit,
        unitCost: Number(f.unitCost) || 0, reorderLevel: Number(f.reorderLevel) || 0,
        location: f.location.trim() || null,
      }) });
      toast.success('Inventory updated');
      onSaved();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-900">Update Inventory</h3>
            <p className="text-xs text-gray-400 mt-0.5">{item.itemCode} · {item.itemName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" min="0" value={f.quantity} onChange={e => set('quantity', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={f.unit} onChange={e => set('unit', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (₱)</label>
              <input type="number" min="0" step="0.01" value={f.unitCost} onChange={e => set('unitCost', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
              <input type="number" min="0" value={f.reorderLevel} onChange={e => set('reorderLevel', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input value={f.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Aisle 3, Shelf B"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Signature pad (draw or upload) — saved as a data-URL to the warehouse account
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
      const res = await wFetch<{ signature: string }>('/warehouse/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      onSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">My e-signature</h2>
        <p className="text-sm text-gray-500 mt-0.5">Saved to your warehouse account for signing off inventory paperwork. Draw below or upload an image.</p>
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
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors ml-auto">{saving ? 'Saving…' : 'Save signature'}</button>
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
// Portal shell (collapsible sidebar + inventory management)
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('inventory');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [accepting, setAccepting] = useState<ItemRequest | null>(null);
  const [busyId, setBusyId] = useState('');

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [inv, irs, wds, sig] = await Promise.all([
        wFetch<InventoryItem[]>('/inventory'),
        wFetch<ItemRequest[]>('/item-requests').catch(() => []),
        wFetch<WithdrawalRequest[]>('/inventory-withdrawals').catch(() => []),
        wFetch<{ signature: string | null }>('/warehouse/signature'),
      ]);
      setItems(inv || []);
      setItemRequests(irs || []);
      setWithdrawals(wds || []);
      setSignature(sig?.signature || null);
    }
    catch (e: any) { if (!silent) toast.error(e.message || 'Failed to load inventory'); }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Paused while a review/accept is in flight so a poll can't race the mutation's own refetch.
  useLiveRefresh(() => load({ silent: true }), { enabled: !busyId });

  const declineRequest = async (r: ItemRequest) => {
    if (!(await confirmDialog({ title: `Decline the request for “${r.itemName}”?`, message: 'No item will be created.', confirmLabel: 'Decline', tone: 'danger' }))) return;
    setBusyId(r.id);
    try {
      const updated = await wFetch<ItemRequest>(`/item-requests/${r.id}/review`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) });
      setItemRequests(prev => prev.map(x => x.id === r.id ? { ...x, ...updated } : x));
      toast.success('Request declined');
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(''); }
  };

  const pendingRequests = itemRequests.filter(r => r.status === 'pending').length;

  // Releasing does NOT move stock — it records that the warehouse confirmed the item is on the
  // shelf. The admin's approval afterwards is what deducts, so a refusal never needs a reversal.
  const reviewWithdrawal = async (w: WithdrawalRequest, status: 'warehouse-approved' | 'rejected') => {
    const ok = status === 'rejected'
      ? await confirmDialog({ title: `Decline this withdrawal?`, message: `${w.quantity} ${w.unit || ''} of ${w.itemName}. It will not go to the admin.`, confirmLabel: 'Decline', tone: 'danger' })
      : await confirmDialog({ title: `Release this withdrawal?`, message: `Confirm ${w.quantity} ${w.unit || ''} of ${w.itemName} is on the shelf. It then goes to the admin for approval.`, confirmLabel: 'Release' });
    if (!ok) return;
    setBusyId(w.id);
    try {
      const updated = await wFetch<WithdrawalRequest>(`/inventory-withdrawals/${w.id}/review`, { method: 'PUT', body: JSON.stringify({ status }) });
      setWithdrawals(prev => prev.map(x => x.id === w.id ? { ...x, ...updated } : x));
      toast.success(status === 'rejected' ? 'Request declined' : `Released — ${w.withdrawalNumber || 'the request'} now goes to the admin for approval`);
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(''); }
  };

  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;

  const filtered = useMemo(() => items.filter(it => {
    const q = search.toLowerCase();
    return !q || it.itemName.toLowerCase().includes(q) || (it.itemCode || '').toLowerCase().includes(q);
  }), [items, search]);

  const NAV: { id: PortalView; label: string; icon: any }[] = [
    { id: 'inventory',    label: 'Inventory', icon: Boxes },
    { id: 'itemRequests', label: 'Item Requests', icon: ClipboardList },
    { id: 'withdrawals',  label: 'Withdrawals', icon: PackageMinus },
    { id: 'signature',    label: 'My Signature', icon: PenTool },
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
          {!collapsed && <span className="text-sm font-semibold tracking-wide text-gray-500">Warehouse</span>}
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{(session.full_name || '?').charAt(0).toUpperCase()}</span></div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{session.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{session.email}</p>
            </div>
          )}
        </div>
        <button onClick={onSignOut} title="Sign out"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 ${collapsed ? 'justify-center' : ''}`}>
          <LogOut className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className={`flex-shrink-0 z-30 w-64 lg:relative lg:flex lg:flex-col transition-all duration-200 ${collapsed ? 'lg:w-20' : 'lg:w-64'} ${mobileOpen ? 'fixed inset-y-0 left-0 flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>{sidebar}</div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between bg-white border-b border-gray-200 px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {view === 'signature' && <SignaturePad initial={signature} onSaved={setSignature} />}

          {view === 'inventory' && <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Search item name or code…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <button onClick={() => setAdding(true)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700"><Plus className="w-4 h-4" /> Add Item</button>
          </div>

          {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
            : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Package className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No inventory items</p></div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3">Item Code</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(it => {
                        const s = stockStatus(it);
                        return (
                          <tr key={it.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{it.itemCode}</td>
                            <td className="px-4 py-3 text-gray-700">{it.itemName}</td>
                            <td className="px-4 py-3 text-gray-500">{it.unit}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(it.quantity) || 0}</td>
                            <td className="px-4 py-3"><span className={`text-xs font-semibold ${s.cls}`}>{s.label}</span></td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => setEditing(it)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Update</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}

          {/* ITEM REQUESTS — production asking for stock inventory doesn't carry yet */}
          {view === 'itemRequests' && <>
          <div>
            <h2 className="font-bold text-gray-900">Item Requests</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Production can only put items on a purchase request that already exist in inventory. Accepting one creates the item.
              {pendingRequests > 0 && <> <strong className="text-brand-gold">{pendingRequests} awaiting you.</strong></>}
            </p>
          </div>

          {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
            : itemRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400"><ClipboardList className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No item requests</p></div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3">Request</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3">Requested by</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemRequests.map(r => (
                        <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {r.requestNumber || '—'}
                            <div className="text-xs font-normal text-gray-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {r.itemName}
                            {/* The specification is how the warehouse tells two similar parts
                                apart — it is the whole reason to accept or decline. */}
                            {r.description && <div className="text-xs text-gray-400 max-w-xs truncate" title={r.description}>{r.description}</div>}
                            {r.itemCode && <div className="text-xs text-gray-400">added as {r.itemCode}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{r.unit || '—'}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {r.requestedByName || '—'}
                            {r.reason && <div className="text-xs text-gray-400 max-w-xs truncate" title={r.reason}>{r.reason}</div>}
                          </td>
                          <td className="px-4 py-3"><span className="text-xs font-semibold text-brand-gold">{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
                          <td className="px-4 py-3 text-right">
                            {r.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => setAccepting(r)} disabled={busyId === r.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Accept</button>
                                <button onClick={() => declineRequest(r)} disabled={busyId === r.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><X className="w-3.5 h-3.5" /> Decline</button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">{r.reviewedBy ? `by ${r.reviewedBy}` : '—'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}

          {/* WITHDRAWALS — the first of two approvals. Releasing moves no stock; the admin's
              approval afterwards is what deducts. */}
          {view === 'withdrawals' && <>
          <div>
            <h2 className="font-bold text-gray-900">Withdrawal Requests</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Confirm the stock is on the shelf and release it — the admin approves after you, and that is when it leaves inventory.
              {pendingWithdrawals > 0 && <> <strong className="text-brand-gold">{pendingWithdrawals} awaiting you.</strong></>}
            </p>
          </div>

          {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
            : withdrawals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400"><PackageMinus className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No withdrawal requests</p></div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3">WD #</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3">Requested by</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map(w => (
                        <tr key={w.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {w.withdrawalNumber || '—'}
                            {w.prNumber && <div className="text-xs font-normal text-gray-400">for {w.prNumber}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {w.itemName || '—'}
                            {w.reason && <div className="text-xs text-gray-400 max-w-xs truncate" title={w.reason}>{w.reason}</div>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{w.quantity} {w.unit || ''}</td>
                          <td className="px-4 py-3 text-gray-500">{w.requestedByName || '—'}</td>
                          <td className="px-4 py-3"><span className="text-xs font-semibold text-brand-gold">{WD_STATUS_LABEL[w.status] || w.status}</span></td>
                          <td className="px-4 py-3 text-right">
                            {w.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => reviewWithdrawal(w, 'warehouse-approved')} disabled={busyId === w.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Release</button>
                                <button onClick={() => reviewWithdrawal(w, 'rejected')} disabled={busyId === w.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><X className="w-3.5 h-3.5" /> Decline</button>
                              </div>
                            ) : w.status === 'warehouse-approved' ? (
                              <span className="text-xs text-gray-400">released by {w.warehouseBy || 'you'}</span>
                            ) : (
                              <span className="text-xs text-gray-400">{w.reviewedBy ? `by ${w.reviewedBy}` : '—'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}
        </main>
      </div>

      {adding && <AddItemModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {editing && <UpdateItemModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {/* Accept opens the same New Item form, prefilled — so a typo or a wrong unit can be
          fixed before it becomes a permanent row production will order against. */}
      {accepting && (
        <AddItemModal
          title="Accept item request"
          subtitle={`${accepting.requestNumber || ''} — requested by ${accepting.requestedByName || 'production'}`}
          initial={{ itemName: accepting.itemName, unit: accepting.unit || 'pcs' }}
          save={async (body) => {
            const updated = await wFetch<ItemRequest>(`/item-requests/${accepting.id}/review`, {
              method: 'PUT', body: JSON.stringify({ status: 'approved', ...body }),
            });
            toast.success(`Added as ${updated.itemCode} — ${updated.itemName} is now selectable`);
          }}
          onClose={() => setAccepting(null)}
          onSaved={() => { setAccepting(null); load(); }}
        />
      )}
    </div>
  );
}

export function WarehousePortal() {
  const [session, setSession] = useState<Session | null>(readSession());
  useDocumentTitle('Warehouse');

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {session ? <Portal session={session} onSignOut={signOut} /> : <WarehouseLogin onLoggedIn={setSession} />}
    </ErrorBoundary>
  );
}
