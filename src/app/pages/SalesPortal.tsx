import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, PenTool, Menu, X, Search, Clock, Calendar, Printer, LogOut,
  Upload, Eraser, Plus, Trash2, PanelLeftClose, PanelLeftOpen, PackageMinus, MessageSquare, Users, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';
import { WithdrawalTab } from '../components/WithdrawalTab';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { confirmDialog } from '../lib/confirm';
import { printSalesOrder } from '../lib/orderPrint';

// ============================================================================
// Sales portal (/sales). Fully independent of the admin dashboard: sales staff sign in with
// a dedicated Sales Account (created by an admin), using its OWN token/session — separate
// from the admin `fleet_auth` and from every other portal's token.
//
// They raise sales orders against customers and print them. An admin approves the order;
// approved orders are what Logistics can then dispatch (/logistics).
// ============================================================================

type PortalView = 'orders' | 'quotations' | 'clients' | 'withdrawals' | 'signature';

interface LineItem { id: string; description: string; quantity: number; unit: string; unitPrice: number; amount: number; }
interface SalesOrder {
  id: string; soNumber: string; client: string; description?: string | null;
  amount: number; status: string; createdDate?: string | null; deliveryDate?: string | null;
  docDate?: string | null; preparedBy?: string | null; reviewedBy?: string | null;
  customerAddress?: string | null; customerContact?: string | null;
  paymentTerms?: string | null; termsAndConditions?: string | null;
  line?: string | null; source?: string | null;
}
interface Customer { id: string; name: string; type?: string | null; address?: string; location?: string | null; contactPerson?: string | null; phone?: string | null; email?: string | null; }
// A quotation is an `inquiries` row (the sales pipeline). Sales creates one, then converts a
// won quotation into a sales order (#6).
interface Quotation {
  id: string; inquiryDate?: string | null; customerId?: string | null; customerName?: string | null;
  contact?: string | null; whatTheyWant?: string | null; quoteAmount?: number | null; status: string;
  salesOrderId?: string | null; notes?: string | null;
}
interface Session { id: number; full_name: string; email: string; phone?: string; }

const TOKEN_KEY = 'sales_token';
const SESSION_KEY = 'sales_session';

// Domain vocabulary, mirroring the admin sales list.
const SO_LINES = ['Sheet metal (panels)', 'Sheet metal (branded)', 'Trading (electrical)', 'Trading (mechanical)', 'Fabrication (subcon)'];
const SO_SOURCES = ['Referral', 'Facebook', 'Marketplace', 'Ad', 'Walk-in', 'Website', 'Existing contact'];
const UNITS = ['pcs', 'sets', 'units', 'Lot', 'kg', 'meters', 'boxes'];

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Plain brand-gold text, no pill — matching every other portal.
const statusPill = (): string => 'text-brand-gold';
const statusLabel = (s: string) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// Sales-authed fetch (sends sales_token). Distinct from admin client.ts and other portals.
async function sFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
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
// Login (its own endpoint — /api/sales/login)
// ============================================================================
function SalesLogin({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/sales/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.sales));
      onLoggedIn(data.sales);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-4">
          <img src="/kimoel-logo.png" alt="Kimoel" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Sales</h1>
            <p className="text-sm text-gray-500">Sign in with your sales account</p>
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
// Signature pad (draw or upload) — saved as a data-URL to the sales account
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
      const res = await sFetch<{ signature: string }>('/sales/signature', { method: 'PUT', body: JSON.stringify({ signature: data }) });
      onSaved(res.signature);
      setDirty(false);
      toast.success('Signature saved');
    } catch (err: any) { toast.error(err.message || 'Failed to save signature'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">My e-signature</h2>
        <p className="text-sm text-gray-500 mt-0.5">Saved to your sales account for signing off orders. Draw below or upload an image.</p>
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
// Create a sales order. The server assigns SO-YYYY-NNNN; line items are serialized into
// `description` in the labelled-blob format the printout parses back out.
// ============================================================================
function CreateSOModal({ session, customers, onClose, onCreated }: {
  session: Session; customers: Customer[]; onClose: () => void; onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    customerId: '', client: '', customerAddress: '', customerContact: '',
    soDate: today, deliveryDate: '', line: SO_LINES[0], source: SO_SOURCES[0],
    paymentTerms: '30 days from receipt/acceptance',
  });
  const [items, setItems] = useState<LineItem[]>([
    { id: '1', description: '', quantity: 1, unit: 'pcs', unitPrice: 0, amount: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  // Picking a known customer fills their details; a walk-in can still be typed by hand.
  const pickCustomer = (id: string) => {
    const c = customers.find(x => x.id === id);
    setF(p => ({
      ...p, customerId: id,
      client: c?.name || p.client,
      customerAddress: c?.address || '',
      customerContact: c ? [c.contactPerson, c.phone].filter(Boolean).join(' · ') : '',
    }));
  };

  const setItem = (id: string, patch: Partial<LineItem>) => setItems(prev => prev.map(it => {
    if (it.id !== id) return it;
    const next = { ...it, ...patch };
    next.amount = (Number(next.quantity) || 0) * (Number(next.unitPrice) || 0);
    return next;
  }));
  const addItem = () => setItems(prev => [...prev, { id: String(prev.length + 1), description: '', quantity: 1, unit: 'pcs', unitPrice: 0, amount: 0 }]);
  const removeItem = (id: string) => setItems(prev => prev.length === 1 ? prev : prev.filter(it => it.id !== id));

  const total = useMemo(() => items.reduce((t, it) => t + (Number(it.amount) || 0), 0), [items]);

  const save = async () => {
    if (!f.client.trim()) { toast.error('Client is required'); return; }
    if (!f.deliveryDate) { toast.error('Delivery date is required'); return; }
    const valid = items.filter(it => it.description.trim() && Number(it.quantity) > 0);
    if (!valid.length) { toast.error('Add at least one item with a description and quantity'); return; }
    setSaving(true);
    try {
      const lineItems = valid.map((it, i) => ({
        id: String(i + 1), no: i + 1, description: it.description.trim(),
        quantity: it.quantity, unit: it.unit, unitCost: it.unitPrice, unitPrice: it.unitPrice, amount: it.amount,
      }));
      // The blob format the printout reads back. Kept on one line per label — the parser is
      // line-wise, and a newline inside the JSON would break it.
      const description = [
        `Address: ${f.customerAddress || ''}`,
        `Contact: ${f.customerContact || ''}`,
        `Prepared By: ${session.full_name}`,
        `Reviewed By: `,
        `Payment Terms: ${f.paymentTerms}`,
        `Line Items: ${JSON.stringify(lineItems)}`,
        `Sub Total: ${total}`,
        `Other Charges: 0`,
        `VAT Amount: 0`,
        `Total Amount: ${total}`,
      ].join('\n');

      await sFetch('/sales-orders', {
        method: 'POST',
        body: JSON.stringify({
          client: f.client.trim(),
          customerId: f.customerId || null,
          description,
          amount: total,
          createdDate: f.soDate,
          docDate: f.soDate,
          deliveryDate: f.deliveryDate,
          line: f.line,
          source: f.source,
          customerAddress: f.customerAddress.trim() || null,
          customerContact: f.customerContact.trim() || null,
          paymentTerms: f.paymentTerms,
          preparedBy: session.full_name,
        }),
      });
      toast.success('Sales order created — sent to admin for approval');
      onCreated();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Sales Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">The order number is assigned automatically.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client <span className="text-red-500">*</span></label>
              <select value={f.customerId} onChange={e => pickCustomer(e.target.value)} className={`${input} bg-white`}>
                <option value="">Walk-in / type below…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client name <span className="text-red-500">*</span></label>
              <input value={f.client} onChange={e => set('client', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input value={f.customerAddress} onChange={e => set('customerAddress', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
              <input value={f.customerContact} onChange={e => set('customerContact', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SO date</label>
              <input type="date" value={f.soDate} onChange={e => set('soDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery date <span className="text-red-500">*</span></label>
              <input type="date" value={f.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Line</label>
              <select value={f.line} onChange={e => set('line', e.target.value)} className={`${input} bg-white`}>
                {SO_LINES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select value={f.source} onChange={e => set('source', e.target.value)} className={`${input} bg-white`}>
                {SO_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Items</label>
              <button onClick={addItem} className="inline-flex items-center gap-1 text-xs font-medium text-brand-gold hover:underline"><Plus className="w-3.5 h-3.5" /> Add item</button>
            </div>
            <div className="space-y-2">
              {items.map(it => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
                  <input placeholder="Description" value={it.description} onChange={e => setItem(it.id, { description: e.target.value })} className={`${input} col-span-5`} />
                  <input type="number" min="0" placeholder="Qty" value={it.quantity} onChange={e => setItem(it.id, { quantity: Number(e.target.value) })} className={`${input} col-span-2`} />
                  <select value={it.unit} onChange={e => setItem(it.id, { unit: e.target.value })} className={`${input} col-span-2 bg-white`}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" placeholder="Price" value={it.unitPrice} onChange={e => setItem(it.id, { unitPrice: Number(e.target.value) })} className={`${input} col-span-2`} />
                  <button onClick={() => removeItem(it.id)} disabled={items.length === 1}
                    className="col-span-1 p-2 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="text-right mt-3 text-sm font-bold text-gray-900">Total: {peso(total)}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment terms</label>
            <input value={f.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} className={input} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"><FileText className="w-4 h-4" /> {saving ? 'Creating…' : 'Create Sales Order'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Portal shell
// ============================================================================
function Portal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<PortalView>('orders');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sos, custs, quotes, sig] = await Promise.all([
        sFetch<SalesOrder[]>('/sales-orders'),
        sFetch<Customer[]>('/customers').catch(() => []),
        sFetch<Quotation[]>('/inquiries').catch(() => []),
        sFetch<{ signature: string | null }>('/sales/signature'),
      ]);
      setOrders(sos || []);
      setCustomers(custs || []);
      setQuotations(quotes || []);
      setSignature(sig?.signature || null);
    } catch (e: any) {
      if (String(e.message).includes('session expired')) { onSignOut(); return; }
      toast.error(e.message || 'Failed to load sales orders');
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  // #6 — turn a quotation into a sales order (pending admin approval). No PO raised from Sales.
  const convertQuote = async (q: Quotation) => {
    if (q.salesOrderId) { toast.error('This quotation is already converted'); return; }
    if (!(await confirmDialog({ title: `Create sales order from this quotation?`, message: 'A sales order is raised and sent to admin for approval.', confirmLabel: 'Create SO' }))) return;
    setConvertingId(q.id);
    try {
      const r = await sFetch<{ salesOrder?: { soNumber?: string } }>(`/inquiries/${q.id}/convert`, { method: 'POST', body: JSON.stringify({ raisePurchaseOrder: false }) });
      toast.success(`Sales order ${r.salesOrder?.soNumber || ''} created — sent to admin for approval`);
      await loadAll();
      setView('orders');
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setConvertingId(null); }
  };

  const filtered = useMemo(() => orders.filter(so => {
    const q = search.toLowerCase();
    return !q || so.soNumber.toLowerCase().includes(q) || (so.client || '').toLowerCase().includes(q);
  }), [orders, search]);

  const print = (so: SalesOrder) => {
    const r = printSalesOrder(so as any);
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  const NAV: { id: PortalView; label: string; icon: any }[] = [
    { id: 'orders', label: 'Sales Orders', icon: FileText },
    { id: 'quotations', label: 'Quotations', icon: MessageSquare },
    { id: 'clients', label: 'Clients', icon: Users },
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
          {!collapsed && <span className="text-sm font-semibold tracking-wide text-gray-500">Sales</span>}
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span>{label}</span>}
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

          {view === 'withdrawals' && <WithdrawalTab fetchFn={sFetch} />}

          {view === 'quotations' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Quotations</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Quote a client, then turn a won quotation into a sales order.</p>
                </div>
                <button onClick={() => setCreatingQuote(true)} className="sm:ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90"><Plus className="w-4 h-4" /> New quotation</button>
              </div>
              {loading ? <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
                : quotations.length === 0 ? <div className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">No quotations yet.</div>
                : (
                  <div className="space-y-2">
                    {quotations.map(q => (
                      <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{q.customerName || 'Walk-in client'}</h3>
                              <span className="text-xs text-gray-400">{q.quoteAmount != null ? peso(q.quoteAmount) : '—'}</span>
                            </div>
                            {q.whatTheyWant && <p className="text-xs text-gray-500 mt-0.5">{q.whatTheyWant}</p>}
                            <p className="text-xs text-brand-gold font-medium mt-1">{statusLabel(q.status)}{q.salesOrderId ? ' · converted' : ''}</p>
                          </div>
                          {!q.salesOrderId && (
                            <button onClick={() => convertQuote(q)} disabled={convertingId === q.id}
                              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                              {convertingId === q.id ? 'Creating…' : <>Create SO <ArrowRight className="w-3.5 h-3.5" /></>}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {view === 'clients' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Clients</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Who we sell to. New clients appear in the sales-order and quotation pickers.</p>
                </div>
                <button onClick={() => setCreatingClient(true)} className="sm:ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90"><Plus className="w-4 h-4" /> New client</button>
              </div>
              {loading ? <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
                : customers.length === 0 ? <div className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">No clients yet.</div>
                : (
                  <div className="space-y-2">
                    {customers.map(c => (
                      <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-sm">{c.name}</h3>
                          {c.type && <span className="text-xs text-gray-400">{c.type}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[c.contactPerson, c.phone, c.email, c.location].filter(Boolean).join(' · ') || 'No contact details'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {view === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search SO #, client…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={() => setCreating(true)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Sales Order</button>
              </div>

              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><FileText className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No sales orders</p><p className="text-xs mt-1">Create one to get started.</p></div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map(so => (
                      <div key={so.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 text-sm">{so.soNumber}</h3>
                              {so.line && <span className="text-xs text-gray-400">· {so.line}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">Client <span className="text-gray-600 font-medium">{so.client || '—'}</span></p>
                            <p className="text-xs text-gray-400 mt-1">Prepared by <span className="text-gray-600 font-medium">{so.preparedBy || '—'}</span></p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className={`text-xs font-semibold ${statusPill()}`}>{statusLabel(so.status)}</span>
                            {so.status === 'pending' && <span className="text-[11px] text-gray-400">Awaiting admin approval</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {so.createdDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(so.createdDate).toLocaleDateString()}</span>}
                            {so.deliveryDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />delivery {new Date(so.deliveryDate).toLocaleDateString()}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 mr-1">{peso(so.amount)}</span>
                            <button onClick={() => print(so)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
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

      {creating && (
        <CreateSOModal session={session} customers={customers} onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); loadAll(); }} />
      )}
      {creatingQuote && (
        <CreateQuotationModal customers={customers} onClose={() => setCreatingQuote(false)}
          onCreated={() => { setCreatingQuote(false); loadAll(); }} />
      )}
      {creatingClient && (
        <CreateClientModal onClose={() => setCreatingClient(false)}
          onCreated={() => { setCreatingClient(false); loadAll(); }} />
      )}
    </div>
  );
}

// ============================================================================
// Create a quotation (#6). Pick an existing client or type a new name, describe what they want,
// and set the quote amount. It lands as a 'New' inquiries row that can later be converted to a SO.
// ============================================================================
function CreateQuotationModal({ customers, onClose, onCreated }: {
  customers: Customer[]; onClose: () => void; onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [whatTheyWant, setWhatTheyWant] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const picked = customers.find(c => c.id === customerId);

  const submit = async () => {
    const name = (picked?.name || customerName).trim();
    if (!name) { toast.error('Pick a client or type a name'); return; }
    if (!whatTheyWant.trim()) { toast.error('Describe what they want'); return; }
    setSaving(true);
    try {
      await sFetch('/inquiries', { method: 'POST', body: JSON.stringify({
        customerId: customerId || null, customerName: name, contact: picked?.phone || null,
        whatTheyWant: whatTheyWant.trim(), quoteAmount: quoteAmount ? Number(quoteAmount) : null,
        source: source || null, status: 'New', notes: notes.trim() || null,
      }) });
      toast.success('Quotation created');
      onCreated();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New quotation</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Existing client</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={input}>
              <option value="">— pick a client, or type below —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!customerId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">…or new client name</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} className={input} placeholder="Client name" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What they want <span className="text-red-500">*</span></label>
            <textarea value={whatTheyWant} onChange={e => setWhatTheyWant(e.target.value)} rows={2} className={input} placeholder="Describe the items / job" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quote amount</label>
              <input type="number" min="0" step="0.01" value={quoteAmount} onChange={e => setQuoteAmount(e.target.value)} className={input} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select value={source} onChange={e => setSource(e.target.value)} className={input}>
                <option value="">—</option>
                {SO_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={input} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Saving…' : 'Create quotation'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Create a client (#6). Posts to /api/customers (Sales is now permitted). The new client shows
// up immediately in the sales-order and quotation pickers.
// ============================================================================
function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error('A client name is required'); return; }
    setSaving(true);
    try {
      await sFetch('/customers', { method: 'POST', body: JSON.stringify({
        name: name.trim(), type: type.trim() || null, contactPerson: contactPerson.trim() || null,
        phone: phone.trim() || null, email: email.trim() || null, location: location.trim() || null, status: 'Active',
      }) });
      toast.success('Client added');
      onCreated();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New client</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client name <span className="text-red-500">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="Company or person" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <input value={type} onChange={e => setType(e.target.value)} className={input} placeholder="Contractor, distributor…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact person</label>
              <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className={input} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} className={input} placeholder="City / address" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Saving…' : 'Add client'}</button>
        </div>
      </div>
    </div>
  );
}

export function SalesPortal() {
  const [session, setSession] = useState<Session | null>(readSession());
  useDocumentTitle('Sales');

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {session ? <Portal session={session} onSignOut={signOut} /> : <SalesLogin onLoggedIn={setSession} />}
    </ErrorBoundary>
  );
}
