import { useEffect, useMemo, useState } from 'react';
import { PackageMinus, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// Shared "Withdraw from Warehouse" tab (#5). Every department can raise a stock withdrawal —
// the backend already permits it (POST /api/inventory/:id/withdraw is requireAuth), so this is
// the one piece of UI each portal was missing. It is self-contained: it fetches the inventory
// list and the signed-in user's own withdrawals through the portal's own fetch wrapper (so it
// carries that portal's token), and every request goes through the same warehouse-release →
// admin-approve queue that keeps stock integrity.
//
// Plain withdrawals only: no destination, so an approved request simply deducts stock (it does
// NOT become a delivery — that is the Logistics-specific flow, which keeps its own modal).
// ============================================================================

type FetchFn = (path: string, options?: RequestInit) => Promise<any>;

interface InventoryItem { id: string; itemName: string; quantity: number; unit?: string | null }
interface WithdrawalRow { id: string; withdrawalNumber?: string | null; itemName: string; quantity: number; unit?: string | null; reason?: string | null; status: string }

const WD_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting warehouse',
  'warehouse-approved': 'Awaiting admin',
  approved: 'Released',
  rejected: 'Rejected',
};

export function WithdrawalTab({ fetchFn }: { fetchFn: FetchFn }) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [mine, setMine] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [inv, wds] = await Promise.all([
        fetchFn('/inventory').catch(() => []),
        fetchFn('/inventory-withdrawals/mine').catch(() => []),
      ]);
      setInventory(inv || []);
      setMine(wds || []);
    } catch (e: any) {
      if (!silent) toast.error(e.message || 'Failed to load withdrawals');
    } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const requestWithdrawal = async (inventoryId: string, quantity: number, reason: string | null) => {
    await fetchFn(`/inventory/${inventoryId}/withdraw`, { method: 'POST', body: JSON.stringify({ quantity, reason }) });
    toast.success('Withdrawal requested — the warehouse releases it, then an admin approves');
    load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Withdraw from Warehouse</h1>
          <p className="text-sm text-gray-500 mt-0.5">Request stock for your department. The warehouse releases it, then an admin approves before it leaves.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => load()} title="Refresh" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setRequesting(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90"><PackageMinus className="w-4 h-4" /> Request withdrawal</button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
      ) : mine.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">No withdrawals yet. Use “Request withdrawal” to ask the warehouse for stock.</div>
      ) : (
        <div className="space-y-2">
          {mine.map(w => (
            <div key={w.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{w.withdrawalNumber || '—'}</h3>
                    <span className="text-xs text-gray-400">{w.quantity} {w.unit || ''} · {w.itemName}</span>
                  </div>
                  {w.reason && <p className="text-xs text-gray-400 mt-0.5">{w.reason}</p>}
                </div>
                <span className="flex-shrink-0 text-xs font-semibold text-brand-gold">{WD_STATUS_LABEL[w.status] || w.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {requesting && (
        <RequestModal
          inventory={inventory}
          onSubmit={requestWithdrawal}
          onClose={() => setRequesting(false)}
          onDone={() => setRequesting(false)}
        />
      )}
    </div>
  );
}

// The request form — item, quantity, notes. No destination (plain withdrawal).
function RequestModal({ inventory, onSubmit, onClose, onDone }: {
  inventory: InventoryItem[];
  onSubmit: (inventoryId: string, quantity: number, reason: string | null) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const picked = useMemo(() => inventory.find(i => i.id === inventoryId), [inventory, inventoryId]);

  const submit = async () => {
    const qty = Number(quantity);
    if (!inventoryId) { toast.error('Pick an item'); return; }
    if (!qty || qty <= 0) { toast.error('Enter a quantity'); return; }
    if (picked && qty > picked.quantity) { toast.error(`Only ${picked.quantity} ${picked.unit || ''} in stock`); return; }
    setSaving(true);
    try { await onSubmit(inventoryId, qty, reason.trim() || null); onDone(); }
    catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500';
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={input} placeholder="What it's for (optional)" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-lg hover:opacity-90 disabled:opacity-50"><PackageMinus className="w-4 h-4" /> {saving ? 'Requesting…' : 'Request'}</button>
        </div>
      </div>
    </div>
  );
}
