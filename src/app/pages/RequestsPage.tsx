import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, ClipboardList, Package, Menu, X, Plus, Trash2, Search,
  Clock, Calendar, AlertTriangle, PackageMinus, PackagePlus, LogOut, User, Printer, PenTool, Upload, Eraser,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { printWithdrawalReceipt } from '../lib/withdrawalReceiptPrint';
import { esc } from '../lib/orderPrint';

// ============================================================================
// Production portal (/production, formerly /requests). Employees sign in with the account an
// admin created for them; the requester name is taken from that account. All data
// is real (backend), no mock. Uses the employee auth token (separate from the
// admin app's client.ts).
// ============================================================================

type RequestStatus = 'pending' | 'reviewed' | 'verified' | 'ordered' | 'approved' | 'disapproved';
type RequestView = 'new' | 'history' | 'withdrawals' | 'itemRequests' | 'signature';

// `description` holds the inventory item's NAME; `inventoryId` is the item it actually is.
// The id is what lets a delivered purchase order add stock back to the right row — matching on
// the name alone breaks the moment anyone renames an item. Optional because requests filed
// before this existed carry only the name (the receipt falls back to a name match for those).
interface LineItem { id: string; no: number; description: string; inventoryId?: string | null; quantity: number; unit: string; unitCost: number; amount: number; }
// Editable line in the New Request form. quantity/unitCost are kept as strings so the
// fields can be fully cleared (empty), which avoids the "can't erase the leading 0" bug.
interface FormLine { id: string; no: number; description: string; inventoryId: string | null; quantity: string; unit: string; unitCost: string; amount: number; }
interface PurchaseRequest {
  id: string; prNumber: string; employeeName?: string; projectId?: string | null; projectName?: string | null;
  neededBy?: string; supplier?: string; notes?: string; items: LineItem[]; total: number;
  status: RequestStatus; withdrawn?: boolean; createdAt?: string;
  reviewedBy?: string; reviewedAt?: string; checkedBy?: string | null; checkedAt?: string | null;
  verifiedBy?: string | null; verifiedAt?: string | null;
}
// A request for the warehouse to stock something inventory has never carried. The picker only
// offers items that already exist, so without this there is no way to ask for a new one.
type ItemRequestStatus = 'pending' | 'approved' | 'rejected';
interface ItemRequest {
  id: string; requestNumber?: string | null; itemName: string; description?: string | null;
  unit?: string | null; reason?: string | null; status: ItemRequestStatus;
  reviewedBy?: string | null; reviewedAt?: string | null;
  inventoryId?: string | null; itemCode?: string | null; createdAt?: string;
}
// 'warehouse-approved' = the warehouse confirmed the stock is on the shelf and released it;
// stock has NOT moved yet. Only the admin's 'approved' deducts.
type WithdrawalStatus = 'pending' | 'warehouse-approved' | 'approved' | 'rejected';
// From the requester's side. The raw enum would print as "Warehouse-approved".
const WD_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  'warehouse-approved': 'Released',
  approved: 'Approved',
  rejected: 'Declined',
};
interface WithdrawalRequest {
  id: string; withdrawalNumber?: string | null; itemName?: string; quantity: number; unit?: string | null;
  reason?: string; status: WithdrawalStatus; requestedByName?: string | null;
  warehouseBy?: string | null; warehouseAt?: string | null;
  reviewedBy?: string; reviewedAt?: string | null; deductedAt?: string | null;
  purchaseRequestId?: string | null; prNumber?: string | null; createdAt?: string;
}
interface InventoryItem { id: string; itemCode: string; itemName: string; quantity: number; unit: string; location?: string; }
interface Project { id: string; name: string; status?: string; }
interface Session { id: number; full_name: string; email: string; department?: string; position?: string; }

const UNITS = ['pcs', 'bags', 'kg', 'liters', 'meters', 'boxes', 'sets', 'Lot', 'units'];
// "For (Project)" is required, so an explicit choice is needed. Personal use gets its own
// sentinel (mapped back to a null projectId on submit) and '' means "nothing picked yet".
const PERSONAL_USE = '__personal__';
const TOKEN_KEY = 'employee_token';
const SESSION_KEY = 'employee_session';

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (items: { amount: number }[]) => items.reduce((t, i) => t + (Number(i.amount) || 0), 0);

// Statuses render as plain brand-gold text — no pill background or border. Every stage
// shares the accent, so the word itself (Pending / Reviewed / Approved / Disapproved)
// is what distinguishes them; the grey hint line beneath adds the detail.
function statusPill(_status: RequestStatus): string {
  return 'text-brand-gold';
}

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// Employee-authed fetch (sends employee_token). Distinct from the admin client.ts.
async function empFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
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

const NAV_ITEMS: { id: RequestView; label: string; icon: any }[] = [
  { id: 'new',          label: 'New Purchase Request', icon: FileText },
  { id: 'history',      label: 'Request History',      icon: ClipboardList },
  { id: 'withdrawals',  label: 'Withdrawals',          icon: PackageMinus },
  { id: 'itemRequests', label: 'Item Requests',        icon: PackagePlus },
  { id: 'signature',    label: 'My Signature',         icon: PenTool },
];

const emptyLine = (no: number): FormLine => ({ id: `new-${no}-${no}${Math.floor(no * 97)}`, no, description: '', inventoryId: null, quantity: '1', unit: 'pcs', unitCost: '', amount: 0 });

// Employee e-signature pad (draw or upload). Saved to the employee's account and stamped
// on the "Prepared By" block of their purchase-request printouts.
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
      const res = await empFetch<{ signature: string }>('/employee/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      onSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">My e-signature</h2>
        <p className="text-sm text-gray-500 mt-0.5">This signature appears in the <strong>Prepared By</strong> block when you print a purchase request. Draw below or upload an image.</p>
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

// Item picker for a purchase-request line. A STRICT combobox over the warehouse inventory:
// only items that exist in inventory can be requested. You can type to search, but the value
// only commits when you pick a real item — non-matching typed text is discarded on blur.
// The menu ALWAYS shows the full list on click (a native <datalist> hides everything once the
// field holds a full name) and renders in a portal so the table's overflow can't clip it.
function ItemPicker({ value, onCommit, inventory, onRequestNew }: {
  value: string;                       // committed description (an inventory item name, or '')
  // The picker resolves a real InventoryItem, so it hands back the id too — that identity is
  // what a delivered purchase order uses to add stock to the right row later.
  onCommit: (name: string, unit?: string, inventoryId?: string | null) => void;
  inventory: InventoryItem[];
  // The way out of the closed list: ask the warehouse to stock what you just typed. Offered
  // at the moment the item turns out to be missing, which is the only moment you know it is.
  onRequestNew: (typedName: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field in sync when the committed value changes externally (e.g. form reset / Clear).
  useEffect(() => { setQuery(value); }, [value]);

  // Latest query/value read at blur time — avoids a stale closure re-reverting a just-cleared field.
  const queryRef = useRef(query); queryRef.current = query;
  const valueRef = useRef(value); valueRef.current = value;

  const q = query.trim().toLowerCase();
  const exact = inventory.some((iv) => iv.itemName.toLowerCase() === q);
  // Show everything when empty OR when the field already holds an exact item (so reopening
  // lets you switch). Otherwise filter by substring.
  const list = (!q || exact) ? inventory : inventory.filter((iv) => iv.itemName.toLowerCase().includes(q));

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setCoords({ left: r.left, top: r.bottom + 4, width: r.width });
  };
  const openMenu = () => { place(); setOpen(true); };
  const commit = (iv: InventoryItem) => { onCommit(iv.itemName, iv.unit, iv.id); setQuery(iv.itemName); setOpen(false); };

  const resolveOnBlur = () => {
    setOpen(false);
    const cur = queryRef.current.trim();
    if (!cur) { onCommit('', undefined, null); setQuery(''); return; }   // emptied → clear the line
    const match = inventory.find((iv) => iv.itemName.toLowerCase() === cur.toLowerCase());
    if (match) { onCommit(match.itemName, match.unit, match.id); setQuery(match.itemName); }  // exact typed match commits
    else setQuery(valueRef.current);                                     // otherwise discard free text
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); place(); setOpen(true); }}
        onFocus={openMenu}
        onClick={openMenu}
        onBlur={() => setTimeout(resolveOnBlur, 150)}
        placeholder={inventory.length ? 'Select an item' : 'No inventory items yet'}
        className="w-full min-w-[10rem] px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && coords && createPortal(
        <ul
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: coords.width, zIndex: 60 }}
          className="max-h-56 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg text-sm py-1"
        >
          {list.length === 0 ? (
            <li>
              <div className="px-3 py-2 text-gray-400">No matching inventory items</div>
              {/* The escape hatch. Without it this list is a dead end: the text is silently
                  reverted on blur and the submit guard rejects the line anyway, with no hint
                  that asking the warehouse to stock it is even possible.
                  onMouseDown + preventDefault fires before the input's blur handler, which
                  would otherwise revert `query` and take the typed name with it. */}
              {q && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onRequestNew(query.trim()); setOpen(false); }}
                  className="w-full text-left px-3 py-2 border-t border-gray-100 text-brand-gold hover:bg-gray-50 flex items-center gap-2"
                >
                  <PackagePlus className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Request “{query.trim()}” from the warehouse</span>
                </button>
              )}
            </li>
          ) : list.map((iv) => (
            <li key={iv.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(iv); }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3"
              >
                <span className="truncate text-gray-900">{iv.itemName}</span>
                <span className="flex-shrink-0 text-xs text-gray-400">{iv.unit} · {iv.quantity} in stock</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

// Matches statusPill above: brand-gold text, no pill. This was written as coloured pills back
// when the withdrawal screen was first attempted and never rendered — the rest of the app has
// since settled on gold text for every status.
// Two approvals, so the hint names which one you're waiting on — "awaiting approval" for days
// tells you nothing about who to chase.
function withdrawalHint(w: WithdrawalRequest): string {
  if (w.status === 'pending') return 'Awaiting the warehouse';
  if (w.status === 'warehouse-approved') return `Released${w.warehouseBy ? ` by ${w.warehouseBy}` : ''} · awaiting admin approval`;
  if (w.status === 'approved') return `Approved${w.reviewedBy ? ` by ${w.reviewedBy}` : ''}`;
  return `Declined${w.reviewedBy ? ` by ${w.reviewedBy}` : ''}`;
}

// ============================================================================
// Login screen (shown when there is no employee session)
// ============================================================================
function LoginScreen({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/employee/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.employee));
      onLoggedIn(data.employee);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-4">
          <img src="/kimoel-logo.png" alt="Kimoel" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Purchase Requests</h1>
            <p className="text-sm text-gray-500">Sign in with your employee account</p>
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
            className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-xs text-gray-400 text-center">No account? Ask your admin to create one for you.</p>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Withdraw modal (real API). Two modes: ad-hoc item, or fulfil an approved request.
// ============================================================================
type WithdrawTarget =
  | { mode: 'item'; item: InventoryItem }
  | { mode: 'request'; request: PurchaseRequest };

function WithdrawModal({ target, inventory, onCancel, onDone }: {
  target: WithdrawTarget;
  inventory: InventoryItem[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isItem = target.mode === 'item';
  const item = isItem ? target.item : null;
  const request = !isItem ? target.request : null;

  // Resolve by the carried inventoryId first — a name match breaks the moment anyone renames
  // an item, and older requests are the only ones without an id.
  const resolved = useMemo(() => {
    if (!request) return [];
    return request.items.map((li) => {
      const inv = (li.inventoryId && inventory.find((iv) => iv.id === li.inventoryId))
        || inventory.find((iv) => iv.itemName.toLowerCase() === li.description.toLowerCase());
      return { li, inv, enough: !!inv && inv.quantity >= li.quantity };
    });
  }, [request, inventory]);

  const remaining = isItem && item && quantity ? item.quantity - parseInt(quantity, 10) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { toast.error('Please provide a reason for withdrawal'); return; }
    setBusy(true);
    try {
      if (isItem && item) {
        const q = parseInt(quantity, 10);
        if (!q || q <= 0) { toast.error('Enter a valid quantity'); setBusy(false); return; }
        if (q > item.quantity) { toast.error('Cannot withdraw more than available stock'); setBusy(false); return; }
        // Creates a PENDING withdrawal request — stock is only deducted once an admin approves.
        await empFetch(`/inventory/${item.id}/withdraw`, { method: 'POST', body: JSON.stringify({ quantity: q, reason: reason.trim() }) });
        toast.success('Withdrawal requested — awaiting admin approval');
      } else if (request) {
        const missing = resolved.filter((r) => !r.inv);
        const short = resolved.filter((r) => r.inv && !r.enough);
        if (missing.length) { toast.error(`No inventory match for: ${missing.map((m) => m.li.description).join(', ')}`); setBusy(false); return; }
        if (short.length) { toast.error(`Not enough stock for: ${short.map((s) => s.li.description).join(', ')}`); setBusy(false); return; }
        // One pending withdrawal request per line, tagged with the request. Stock does NOT move
        // here: an admin approves each line, and the server flips `withdrawn` once they all are.
        // This used to deduct on the spot via deduct-fulfill, with no admin ever seeing it.
        for (const { li, inv } of resolved) {
          await empFetch(`/inventory/${inv!.id}/withdraw`, {
            method: 'POST',
            body: JSON.stringify({ quantity: li.quantity, reason: `${request.prNumber}: ${reason.trim()}`, purchaseRequestId: request.id }),
          });
        }
        toast.success(`${request.prNumber} — ${resolved.length} withdrawal${resolved.length > 1 ? 's' : ''} sent for admin approval`);
      }
      onDone();
    } catch (err: any) { toast.error(err.message || 'Withdrawal failed'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {/* blue-100/blue-600 are the brand gold ramp (see tailwind.css) — this used to be
                red, which read as a destructive action. Requesting a withdrawal isn't one. */}
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><PackageMinus className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Request Withdrawal</h2>
              {/* Both paths now say the same thing, because both do the same thing: raise a
                  request. Nothing here deducts stock — the warehouse releases it, then an
                  admin approves, and only that deducts. */}
              <p className="text-sm text-gray-500">{isItem ? 'Goes to the warehouse, then the admin' : `${request?.prNumber} · goes to the warehouse, then the admin`}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {isItem && item && (
            <>
              <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{item.itemName}</p>
                  <p className="text-sm text-gray-500">Code: {item.itemCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{item.quantity}</p>
                  <p className="text-sm text-gray-500">{item.unit} available</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Withdraw Quantity *</label>
                <div className="relative">
                  <input type="number" min="1" max={item.quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  <span className="absolute right-4 top-2.5 text-gray-500 text-sm">{item.unit}</span>
                </div>
              </div>
              {remaining !== null && parseInt(quantity, 10) > 0 && (
                <div className={`rounded-lg p-3 border ${remaining <= 10 ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center gap-2">
                    {remaining <= 10 ? <AlertTriangle className="w-4 h-4 text-yellow-600" /> : <Package className="w-4 h-4 text-blue-600" />}
                    <span className={`text-sm ${remaining <= 10 ? 'text-yellow-800' : 'text-blue-800'}`}>If approved, remaining stock: {remaining} {item.unit}{remaining <= 10 ? ' — low stock' : ''}</span>
                  </div>
                </div>
              )}
            </>
          )}
          {request && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Items to withdraw</p>
              {resolved.map(({ li, inv, enough }) => (
                <div key={li.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-900">{li.description}</span>
                  <span className={`font-medium ${!inv ? 'text-red-600' : enough ? 'text-gray-700' : 'text-yellow-700'}`}>
                    {li.quantity} {li.unit}{!inv ? ' · no match' : enough ? '' : ` · only ${inv.quantity} left`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Withdrawal *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required placeholder="e.g., Issued to Lipa site, damaged items, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">{busy ? 'Requesting…' : 'Request Withdrawal'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Choose which stock to withdraw. This is the entry point the withdrawal feature never had:
// the approval queue, the routes and WithdrawModal's `mode: 'item'` branch were all written,
// but nothing ever constructed that target, so no employee could raise a request and the
// admin's queue was structurally always empty.
// ============================================================================
function ItemPickModal({ inventory, onCancel, onPick }: {
  inventory: InventoryItem[];
  onCancel: () => void;
  onPick: (item: InventoryItem) => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Nothing to withdraw from an empty shelf — hide zero-stock items rather than let someone
    // raise a request the approval step is bound to reject.
    return inventory.filter((iv) => iv.quantity > 0 && (!s || iv.itemName.toLowerCase().includes(s) || iv.itemCode.toLowerCase().includes(s)));
  }, [inventory, q]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Withdraw from inventory</h2>
            <p className="text-xs text-gray-400 mt-0.5">Pick the item you need</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item or code…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-y-auto">
          {list.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">No items in stock match that.</p>
          ) : list.map((iv) => (
            <button key={iv.id} onClick={() => onPick(iv)}
              className="w-full text-left px-5 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{iv.itemName}</p>
                <p className="text-xs text-gray-400">{iv.itemCode}</p>
              </div>
              <span className="flex-shrink-0 text-xs text-gray-500">{iv.quantity} {iv.unit}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Ask the warehouse to stock something inventory has never carried. Raised either from the
// item picker (the moment you find out it's missing) or from the Item Requests tab.
// The warehouse creates the real item; nothing here touches inventory.
// ============================================================================
function RequestItemModal({ initialName, onCancel, onDone }: {
  initialName?: string;
  onCancel: () => void;
  onDone: (created: ItemRequest) => void;
}) {
  const [f, setF] = useState({ itemName: initialName || '', unit: 'pcs', description: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.itemName.trim()) { toast.error('An item name is required'); return; }
    setSaving(true);
    try {
      const created = await empFetch<ItemRequest>('/item-requests', {
        method: 'POST',
        body: JSON.stringify({ itemName: f.itemName.trim(), unit: f.unit, description: f.description.trim() || null, reason: f.reason.trim() || null }),
      });
      toast.success(`${created.requestNumber} sent to the warehouse`);
      onDone(created);
    } catch (e: any) {
      // The server refuses a name that already exists (or is already pending) and says which
      // code it is — that message is more useful than a generic failure, so show it as-is.
      toast.error(e.message || 'Failed to send the request');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Request a new item</h2>
            <p className="text-xs text-gray-400 mt-0.5">The warehouse adds it to inventory, then you can select it</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name *</label>
            <input autoFocus value={f.itemName} onChange={(e) => set('itemName', e.target.value)}
              placeholder="e.g. 6205 Deep Groove Ball Bearing"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select value={f.unit} onChange={(e) => set('unit', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specification</label>
            <textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Size, grade, brand — anything the warehouse needs to identify it"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Why you need it</label>
            <textarea rows={2} value={f.reason} onChange={(e) => set('reason', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Sending…' : 'Send to warehouse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main portal
// ============================================================================
function Portal({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [view, setView] = useState<RequestView>('new');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // New-request form state
  const [projectId, setProjectId] = useState<string>(''); // '' = Personal use
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<FormLine[]>([emptyLine(1)]);
  const [submitting, setSubmitting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [withdrawTarget, setWithdrawTarget] = useState<WithdrawTarget | null>(null);
  const [picking, setPicking] = useState(false);
  // null = closed. A string (possibly '') = open, prefilled with what the picker had typed.
  const [requestingItem, setRequestingItem] = useState<string | null>(null);

  const printWithdrawal = async (w: WithdrawalRequest) => {
    const r = await printWithdrawalReceipt(w, () => empFetch(`/inventory-withdrawals/${w.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  // silent: a background poll (useLiveRefresh) refetches without flipping the full-screen
  // spinner or toasting on a blip — only the first mount and explicit reloads show "Loading…".
  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [inv, prj, mine, wds, irs, sig] = await Promise.all([
        empFetch<InventoryItem[]>('/inventory'),
        empFetch<Project[]>('/projects'),
        empFetch<PurchaseRequest[]>('/purchase-requests/mine'),
        empFetch<WithdrawalRequest[]>('/inventory-withdrawals/mine').catch(() => []),
        empFetch<ItemRequest[]>('/item-requests/mine').catch(() => []),
        empFetch<{ signature: string | null }>('/employee/signature').catch(() => ({ signature: null })),
      ]);
      setInventory(inv || []);
      setProjects(prj || []);
      setRequests(mine || []);
      setWithdrawals(wds || []);
      setItemRequests(irs || []);
      setSignature(sig?.signature || null);
    } catch (e: any) {
      // A truly expired session should still log out, even on a background poll.
      if (String(e.message).includes('session expired')) { onLogout(); return; }
      // But a transient blip on a silent poll must not throw a toast every 20s.
      if (!silent) toast.error(e.message || 'Failed to load data');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  // Keep the lists live. Paused while submitting a request so a poll can't race the
  // create→refetch; open modals hold their own state, so a list refetch never disturbs them.
  useLiveRefresh(() => loadAll({ silent: true }), { enabled: !submitting });

  // Line-item helpers. quantity/unitCost are strings (see FormLine) so fields can be emptied;
  // inventoryId is a string or null, hence the widened value type.
  const updateLineItem = (id: string, field: keyof FormLine, value: string | null) => {
    setLineItems((prev) => prev.map((li) => {
      if (li.id !== id) return li;
      const next = { ...li, [field]: value } as FormLine;
      if (field === 'quantity' || field === 'unitCost') next.amount = (Number(next.quantity) || 0) * (Number(next.unitCost) || 0);
      // When the typed/picked description matches a warehouse-inputted inventory item,
      // auto-fill the unit from that item so the row lines up with real stock.
      if (field === 'description') {
        const match = inventory.find((iv) => iv.itemName.toLowerCase() === String(value || '').trim().toLowerCase());
        if (match?.unit) next.unit = match.unit;
      }
      return next;
    }));
  };
  const addLineItem = () => setLineItems((prev) => [...prev, emptyLine(prev.length + 1)]);
  const deleteLineItem = (id: string) => setLineItems((prev) => prev.filter((li) => li.id !== id).map((li, i) => ({ ...li, no: i + 1 })));
  const subTotal = useMemo(() => sum(lineItems), [lineItems]);

  const resetForm = () => { setProjectId(''); setNeededBy(''); setNotes(''); setLineItems([emptyLine(1)]); };

  const handleSubmitRequest = async () => {
    // Everything except Notes is required.
    if (!projectId) { toast.error('Choose what this request is for'); return; }
    if (!neededBy) { toast.error('Set the date this is needed by'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one item'); return; }
    const incomplete = lineItems.find((li) =>
      !li.description.trim() || !li.unit || !(Number(li.quantity) > 0) || !(Number(li.unitCost) > 0));
    if (incomplete) {
      toast.error(`Item ${incomplete.no} is incomplete — item, quantity, unit and est. cost are all required`);
      return;
    }
    const valid = lineItems;
    // Only inventory items may be requested — guard against any line that isn't a known item.
    const known = new Set(inventory.map((iv) => iv.itemName.toLowerCase()));
    const unknown = valid.find((li) => !known.has(li.description.trim().toLowerCase()));
    if (unknown) { toast.error(`"${unknown.description}" is not in inventory — pick an item from the list`); return; }
    setSubmitting(true);
    try {
      await empFetch('/purchase-requests', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId === PERSONAL_USE ? null : projectId,
          neededBy,
          notes: notes.trim() || null,
          // inventoryId travels with the line all the way to receipt: when the resulting
          // purchase order is delivered, that id is what puts the stock back on the right row.
          // Falls back to the picker's resolved match if a line predates the id being carried.
          items: valid.map((li, i) => ({
            no: i + 1,
            description: li.description.trim(),
            inventoryId: li.inventoryId
              || inventory.find((iv) => iv.itemName.toLowerCase() === li.description.trim().toLowerCase())?.id
              || null,
            quantity: Number(li.quantity), unit: li.unit,
            unitCost: Number(li.unitCost) || 0, amount: Number(li.amount) || 0,
          })),
        }),
      });
      toast.success('Purchase request submitted');
      resetForm();
      await loadAll();
      setView('history');
    } catch (e: any) { toast.error(e.message || 'Failed to submit request'); } finally { setSubmitting(false); }
  };

  // Printable purchase-request document (opens a print-ready window). Mirrors the company
  // letterhead used by the purchasing check report for a consistent look.
  const printRequest = async (req: PurchaseRequest) => {
    // Open the window synchronously — inside the click — or the popup blocker kills it. The
    // signature fetch happens after, into the already-open window.
    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow popups to print'); return; }
    w.document.write('<!doctype html><title>Preparing…</title><body style="font:14px sans-serif;padding:2rem;color:#555">Preparing the request…</body>');

    // Three blocks now, so the accounting reviewer's and the approving admin's signatures are
    // needed too — both live on other people's accounts and are ~20KB each, hence the
    // per-document fetch. The employee's own signature is already in state.
    let checkedSignature: string | null = null;
    let approvedSignature: string | null = null;
    try {
      const s = await empFetch<{ preparedSignature: string | null; checkedSignature: string | null; approvedSignature: string | null }>(`/purchase-requests/${req.id}/signatures`);
      checkedSignature = s.checkedSignature;
      approvedSignature = s.approvedSignature;
    } catch {
      // A signature lookup failure must not block the document — the blocks render unsigned.
      toast.error('Could not load signatures; printing without them');
    }

    const rows = req.items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.description || '')}</td>
        <td style="text-align:center">${esc(it.quantity ?? '')}</td>
        <td style="text-align:center">${esc(it.unit || '')}</td>
        <td style="text-align:right">${peso(it.unitCost)}</td>
        <td style="text-align:right">${peso(it.amount)}</td>
      </tr>`).join('');
    // Fixed-height slot whether or not a signature exists, so the rule lines stay level.
    const sigImg = (src: string | null) => src
      ? `<img class="sign-img" src="${esc(src)}" />`
      : `<div style="height:60px"></div>`;
    const signDate = (d?: string | null) =>
      d ? `<div class="sign-date">${esc(new Date(d).toLocaleDateString())}</div>` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Purchase Request ${req.prNumber}</title>
    <style>
      @page { margin: 0.6in; size: A4; }
      /* padding-bottom keeps flowing content clear of the fixed page footer */
      body { font-family: 'Times New Roman', serif; font-size: 11pt; color:#000; padding-bottom: 34px; }
      .system-title { text-align:center; font-size:10pt; letter-spacing:1px; }
      .company-name { text-align:center; font-size:15pt; font-weight:bold; }
      .company-address, .contact-details, .proprietor { text-align:center; font-size:9pt; }
      .doc-title { text-align:center; font-size:13pt; font-weight:bold; margin:14px 0 4px; text-decoration:underline; }
      .meta { display:flex; flex-wrap:wrap; gap:6px 32px; margin:14px 0; font-size:10pt; }
      .meta div span { font-weight:bold; }
      table.items { width:100%; border-collapse:collapse; margin-top:6px; font-size:10pt; }
      table.items th, table.items td { border:1px solid #000; padding:5px 6px; }
      table.items th { background:#f0f0f0; }
      .total { text-align:right; font-weight:bold; margin-top:8px; font-size:11pt; }
      .notes { margin:14px 0 6px; font-size:10.5pt; line-height:1.5; }
      /* Three blocks across (Prepared / Reviewed / Approved), sharing the width via flex:1
         rather than a fixed 280px each — 3 × 280 overflows the A4 text column. Matches the
         accounting and purchasing review reports. */
      .signs { display:flex; gap:20px; margin-top:40px; break-inside:avoid; }
      .sign { flex:1; min-width:0; text-align:center; }
      .sign-img { height:60px; object-fit:contain; margin-bottom:-6px; }
      .sign-line { border-top:1px solid #000; padding-top:3px; font-weight:bold; font-size:10pt; overflow-wrap:break-word; }
      .sign-role { font-size:8.5pt; color:#333; }
      .sign-date { font-size:8.5pt; color:#333; margin-top:1px; }
      /* Real page footer: pinned to the bottom of every printed page. */
      .footer { position:fixed; bottom:0; left:0; right:0; text-align:center; font-size:8pt; color:#333; border-top:1px solid #ccc; padding-top:6px; background:#fff; }
    </style></head><body>
      <div class="system-title">KIMOEL TRACKING SYSTEM</div>
      <div class="company-name">KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
      <div class="company-address">PUROK 1, LODLOD, LIPA CITY, BATANGAS</div>
      <div class="contact-details">Tel: (043) - 741 - 2023 | Email: kimoel_leotagle@yahoo.com</div>
      <div class="proprietor">LEO TAGLE (Mobile: 0917 - 628 - 3217)</div>
      <div class="doc-title">PURCHASE REQUEST</div>
      <div class="meta">
        <div><span>PR No.:</span> ${esc(req.prNumber)}</div>
        <div><span>For (Project):</span> ${esc(req.projectName || 'Personal use')}</div>
        <div><span>Date filed:</span> ${esc(req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—')}</div>
        <div><span>Needed by:</span> ${esc(req.neededBy ? new Date(req.neededBy).toLocaleDateString() : '—')}</div>
      </div>
      <table class="items">
        <thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Unit</th><th>Est. Cost</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total: ${peso(req.total)}</div>
      ${req.notes ? `<div class="notes"><span style="font-weight:bold">Notes:</span> ${esc(req.notes)}</div>` : ''}
      <div class="signs">
        <div class="sign">
          ${sigImg(signature)}
          <div class="sign-line">${esc(req.employeeName || session.full_name)}</div>
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
      </div>
      <div class="footer">Purchase Request ${esc(req.prNumber)} | KIMOEL TRADING &amp; CONSTRUCTION INCORPORATED</div>
    </body></html>`;
    // open() resets the document — without it, write() appends onto the "Preparing…" placeholder.
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onload = () => { w.print(); };
  };

  const filteredRequests = requests.filter((r) => statusFilter === 'all' || r.status === statusFilter);

  // Withdrawal state per purchase request. `withdrawals` already carries purchaseRequestId and
  // nothing read it: the Withdraw button was gated only on `req.withdrawn`, which the server
  // flips only once EVERY line is approved. So between requesting and approval the button
  // looked untouched, and clicking again raised a second full set — approving both deducted
  // the stock twice. The server now refuses the duplicate outright; this is what stops the
  // user being offered it in the first place.
  const withdrawalStateFor = (reqId: string): 'none' | 'pending' | 'done' | 'rejected' => {
    const lines = withdrawals.filter((w) => w.purchaseRequestId === reqId);
    if (!lines.length) return 'none';
    if (lines.some((w) => w.status === 'pending' || w.status === 'warehouse-approved')) return 'pending';
    if (lines.some((w) => w.status === 'approved')) return 'done';
    return 'rejected'; // every line refused — re-requesting is the way forward
  };

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
          {!collapsed && <span className="text-sm font-semibold tracking-wide text-gray-500">Production</span>}
        </div>
        {/* Logo stays visible when collapsed, just scaled down to fit the icon rail. */}
        <div className={`flex justify-center ${collapsed ? 'px-2 pt-2 pb-3' : 'px-5 pt-4 pb-4'}`}>
          <img src="/kimoel-logo.png" alt="Logo"
            className={`${collapsed ? 'h-10' : 'h-32'} w-auto object-contain transition-all duration-200`} />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button key={id} title={label} onClick={() => { setView(id); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-white" /></div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{session.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{session.email}</p>
            </div>
          )}
        </div>
        <button onClick={onLogout} title="Sign out" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 ${collapsed ? 'justify-center' : ''}`}>
          <LogOut className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className={`flex-shrink-0 w-64 z-30 lg:relative lg:flex lg:flex-col transition-all duration-200 ${collapsed ? 'lg:w-20' : 'lg:w-64'} ${mobileMenuOpen ? 'fixed inset-y-0 left-0 flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>{sidebar}</div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between bg-white border-b border-gray-200 px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100">{mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {/* NEW REQUEST */}
          {view === 'new' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">Purchase Request</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Requesting as <span className="font-medium text-gray-700">{session.full_name}</span></p>
                </div>
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">For (Project) <span className="text-red-500">*</span></label>
                      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="" disabled>Select…</option>
                        <option value={PERSONAL_USE}>Personal use</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Needed By <span className="text-red-500">*</span></label>
                      <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-gray-700">Items</label>
                      <button onClick={addLineItem} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"><Plus className="w-4 h-4" /> Add item</button>
                    </div>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                            <th className="text-left font-medium px-3 py-2 w-10">No</th>
                            <th className="text-left font-medium px-3 py-2">Description <span className="text-red-500">*</span></th>
                            <th className="text-left font-medium px-3 py-2 w-20">Qty <span className="text-red-500">*</span></th>
                            <th className="text-left font-medium px-3 py-2 w-28">Unit <span className="text-red-500">*</span></th>
                            <th className="text-left font-medium px-3 py-2 w-32">Est. Cost <span className="text-red-500">*</span></th>
                            <th className="text-right font-medium px-3 py-2 w-32">Amount</th>
                            <th className="px-2 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {lineItems.map((li) => (
                            <tr key={li.id}>
                              <td className="px-3 py-2 text-gray-400">{li.no}</td>
                              <td className="px-3 py-2"><ItemPicker value={li.description} onCommit={(name, unit, inventoryId) => { updateLineItem(li.id, 'description', name); updateLineItem(li.id, 'inventoryId', inventoryId ?? null); if (unit) updateLineItem(li.id, 'unit', unit); }} inventory={inventory} onRequestNew={setRequestingItem} /></td>
                              <td className="px-3 py-2"><input type="number" min="0" value={li.quantity} onChange={(e) => updateLineItem(li.id, 'quantity', e.target.value)} placeholder="0" className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></td>
                              <td className="px-3 py-2">
                                <select value={li.unit} onChange={(e) => updateLineItem(li.id, 'unit', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={li.unitCost} onChange={(e) => updateLineItem(li.id, 'unitCost', e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></td>
                              <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{peso(li.amount)}</td>
                              <td className="px-2 py-2 text-center">{lineItems.length > 1 && <button onClick={() => deleteLineItem(li.id)} className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end mt-3">
                      <div className="w-56 flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-700">Total</span>
                        <span className="text-lg font-bold text-gray-900">{peso(subTotal)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Describe the purpose of this request…" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button onClick={resetForm} className="flex-1 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Clear</button>
                    <button onClick={handleSubmitRequest} disabled={submitting} className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit Request'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MY SIGNATURE */}
          {view === 'signature' && <SignaturePad initial={signature} onSaved={setSignature} />}

          {/* HISTORY */}
          {view === 'history' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-semibold text-gray-900">My Requests <span className="text-gray-400 font-normal">({filteredRequests.length})</span></h2>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">All statuses</option><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="ordered">Ordered</option><option value="approved">Approved</option><option value="disapproved">Disapproved</option>
                </select>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filteredRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                    <ClipboardList className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500">No requests found</p>
                    <button onClick={() => setView('new')} className="mt-3 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Request</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRequests.map((req) => {
                      const wState = withdrawalStateFor(req.id);
                      return (
                      <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{req.prNumber}</h3>
                              <span className="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''}</span>
                              <span className="text-xs text-gray-400">· {req.projectName || 'Personal use'}</span>
                              {/* Three states, not one. `withdrawn` alone couldn't show the gap
                                  between asking and being approved — which is exactly the gap
                                  in which the button used to invite a duplicate. */}
                              {req.withdrawn ? <span className="text-xs font-medium text-emerald-600">• Withdrawn</span>
                                : wState === 'pending' ? <span className="text-xs font-medium text-brand-gold">• Withdrawal pending</span>
                                : wState === 'done' ? <span className="text-xs font-medium text-emerald-600">• Withdrawn</span>
                                : wState === 'rejected' ? <span className="text-xs font-medium text-gray-400">• Withdrawal declined</span>
                                : null}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{req.items.map((i) => i.description).join(', ')}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Prepared by <span className="text-gray-600 font-medium">{req.employeeName || session.full_name}</span>
                              {req.checkedBy && <> · Reviewed by <span className="text-gray-600 font-medium">{req.checkedBy}</span></>}
                              {req.status === 'approved' && req.reviewedBy && <> · Approved by <span className="text-gray-600 font-medium">{req.reviewedBy}</span></>}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className={`text-xs font-semibold ${statusPill(req.status)}`}>{req.status.charAt(0).toUpperCase() + req.status.slice(1)}</span>
                            {/* Sub-status hints are ambient text: same muted gray for every status.
                                They track the flow: accounting review → purchase order → admin approval. */}
                            {req.status === 'pending' && <span className="text-[11px] text-gray-400">Awaiting accounting review</span>}
                            {req.status === 'reviewed' && <span className="text-[11px] text-gray-400">Awaiting admin verification</span>}
                            {req.status === 'verified' && <span className="text-[11px] text-gray-400">Awaiting purchase order</span>}
                            {req.status === 'ordered' && <span className="text-[11px] text-gray-400">Awaiting admin approval</span>}
                          </div>
                        </div>
                        {req.notes && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{req.notes}</p>}
                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {req.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.createdAt).toLocaleDateString()}</span>}
                            {req.neededBy && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />needed {new Date(req.neededBy).toLocaleDateString()}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-900">{peso(req.total)}</span>
                            <button onClick={() => printRequest(req)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                            {/* Gone while anything is outstanding — a second click here is what
                                used to double-deduct. 'rejected' still offers it: every line
                                was refused, so re-requesting is the only way forward. */}
                            {req.status === 'approved' && !req.withdrawn && (wState === 'none' || wState === 'rejected') && (
                              <button onClick={() => setWithdrawTarget({ mode: 'request', request: req })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><PackageMinus className="w-3.5 h-3.5" /> {wState === 'rejected' ? 'Request again' : 'Withdraw items'}</button>
                            )}
                            {req.status === 'approved' && !req.withdrawn && wState === 'pending' && (
                              <span className="text-xs text-gray-400">Withdrawal awaiting approval</span>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          {view === 'withdrawals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-gray-900">My withdrawals</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Stock leaves inventory only once an admin approves. Approved ones can be printed as a receipt.</p>
                </div>
                <button onClick={() => setPicking(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <PackageMinus className="w-4 h-4" /> New withdrawal
                </button>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : withdrawals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-white rounded-xl border border-gray-200">
                    <PackageMinus className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500">No withdrawals yet</p>
                    <p className="text-xs mt-1">Withdraw stock from inventory, or from an approved request.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {withdrawals.map((w) => (
                      <div key={w.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{w.withdrawalNumber || '—'}</h3>
                              {w.prNumber && <span className="text-xs text-gray-400">· for {w.prNumber}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              <span className="text-gray-600 font-medium">{w.itemName || '—'}</span> · {w.quantity} {w.unit || ''}
                            </p>
                            {w.reason && <p className="text-xs text-gray-400 mt-0.5 truncate">{w.reason}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            {/* Not status.charAt(0).toUpperCase() — that renders the raw enum
                                as "Warehouse-approved", which reads like a typo on screen. */}
                            <span className="text-xs font-semibold text-brand-gold">{WD_STATUS_LABEL[w.status] || w.status}</span>
                            <span className="text-[11px] text-gray-400">{withdrawalHint(w)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {w.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />requested {new Date(w.createdAt).toLocaleDateString()}</span>}
                            {w.deductedAt && <span className="flex items-center gap-1"><PackageMinus className="w-3 h-3" />released {new Date(w.deductedAt).toLocaleDateString()}</span>}
                          </div>
                          {/* Only an approved withdrawal has actually moved stock, so only that
                              one is worth a receipt. */}
                          {w.status === 'approved' && (
                            <button onClick={() => printWithdrawal(w)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print receipt</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* ITEM REQUESTS — asking the warehouse to stock something new */}
          {view === 'itemRequests' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-gray-900">Item requests</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Ask the warehouse to add an item inventory doesn’t carry yet. Once they add it, you can select it on a purchase request.</p>
                </div>
                <button onClick={() => setRequestingItem('')} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <PackagePlus className="w-4 h-4" /> Request an item
                </button>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : itemRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-white rounded-xl border border-gray-200">
                    <PackagePlus className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500">No item requests yet</p>
                    <p className="text-xs mt-1">Can’t find something on a purchase request? Ask for it here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {itemRequests.map((r) => (
                      <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{r.requestNumber || '—'}</h3>
                              {/* The code only exists once the warehouse has created the item —
                                  it is the thing the requester is actually waiting for. */}
                              {r.itemCode && <span className="text-xs text-gray-400">· {r.itemCode}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              <span className="text-gray-600 font-medium">{r.itemName}</span>{r.unit ? ` · ${r.unit}` : ''}
                            </p>
                            {r.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.description}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className="text-xs font-semibold text-brand-gold">{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
                            <span className="text-[11px] text-gray-400">
                              {r.status === 'pending' ? 'Awaiting the warehouse'
                                : r.status === 'approved' ? 'Now selectable on a request'
                                : r.reviewedBy ? `Declined by ${r.reviewedBy}` : 'Declined'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-3">
                          {r.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />requested {new Date(r.createdAt).toLocaleDateString()}</span>}
                          {r.reviewedAt && <span className="flex items-center gap-1"><Package className="w-3 h-3" />answered {new Date(r.reviewedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </main>
      </div>

      {withdrawTarget && (
        <WithdrawModal target={withdrawTarget} inventory={inventory} onCancel={() => setWithdrawTarget(null)} onDone={() => { setWithdrawTarget(null); loadAll(); }} />
      )}
      {picking && (
        <ItemPickModal
          inventory={inventory}
          onCancel={() => setPicking(false)}
          onPick={(item) => { setPicking(false); setWithdrawTarget({ mode: 'item', item }); }}
        />
      )}
      {/* '' is a valid open state (the tab's own button), so test against null — not falsiness. */}
      {requestingItem !== null && (
        <RequestItemModal
          initialName={requestingItem}
          onCancel={() => setRequestingItem(null)}
          onDone={(created) => {
            setRequestingItem(null);
            setItemRequests((prev) => [created, ...prev]);
            // Land them on the tab that tracks it, so the ask doesn't vanish into nowhere.
            setView('itemRequests');
          }}
        />
      )}
    </div>
  );
}

export function RequestsPage() {
  useDocumentTitle('Production');
  const [session, setSession] = useState<Session | null>(readSession());

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {session ? <Portal session={session} onLogout={logout} /> : <LoginScreen onLoggedIn={setSession} />}
    </ErrorBoundary>
  );
}
