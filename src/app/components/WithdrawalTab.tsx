import { useEffect, useMemo, useState } from 'react';
import { PackageMinus, X, RefreshCw, Printer, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { printWithdrawalReceipt } from '../lib/withdrawalReceiptPrint';

// ============================================================================
// Shared "Withdraw from Warehouse" tab (#5). Every department can raise a stock withdrawal —
// the backend already permits it, so this is the one piece of UI each portal was missing. It is
// self-contained: it fetches the inventory list and the signed-in user's own withdrawals through
// the portal's own fetch wrapper (so it carries that portal's token), and every request goes
// through the same warehouse-release → admin-approve queue that keeps stock integrity.
//
// BATCH withdrawals: one request can cover several items (POST /api/inventory-withdrawals with an
// items array) and prints as ONE receipt. A 1-item request behaves exactly like before.
//
// Plain withdrawals only: no destination, so an approved request simply deducts stock (it does
// NOT become a delivery — that is the Logistics-specific flow, which keeps its own modal).
// ============================================================================

type FetchFn = (path: string, options?: RequestInit) => Promise<any>;

interface InventoryItem { id: string; itemName: string; quantity: number; unit?: string | null }
interface WithdrawalLine { inventoryId?: string | null; itemName?: string | null; quantity: number; unit?: string | null }
interface WithdrawalRow { id: string; withdrawalNumber?: string | null; itemName: string; quantity: number; unit?: string | null; items?: WithdrawalLine[] | null; reason?: string | null; status: string }
interface WithdrawItem { inventoryId: string; quantity: number }

const WD_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting warehouse',
  'warehouse-approved': 'Awaiting admin',
  approved: 'Released',
  rejected: 'Rejected',
};

// Short summary of a withdrawal's items for the list card: "3 pcs · Bolt" for one line,
// "3 items" for a batch.
const itemsSummary = (w: WithdrawalRow): string => {
  const items = (w.items && w.items.length) ? w.items : [{ itemName: w.itemName, quantity: w.quantity, unit: w.unit }];
  if (items.length === 1) { const i = items[0]; return `${i.quantity} ${i.unit || ''} · ${i.itemName || ''}`.trim(); }
  return `${items.length} items`;
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

  const requestWithdrawal = async (items: WithdrawItem[], reason: string | null, jobOrderNo: string | null) => {
    await fetchFn('/inventory-withdrawals', { method: 'POST', body: JSON.stringify({ items, reason, jobOrderNo }) });
    toast.success('Withdrawal requested — the warehouse releases it, then an admin approves');
    load();
  };

  // Prints the WITHDRAWAL REQUEST form before approval (later signature blocks blank) or the
  // STOCK WITHDRAWAL RECEIPT once approved. Signatures resolve through this portal's own fetch.
  const printWithdrawal = async (w: WithdrawalRow) => {
    const r = await printWithdrawalReceipt(w as any, () => fetchFn(`/inventory-withdrawals/${w.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Could not open the print dialog');
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Withdraw from Warehouse</h1>
          <p className="text-sm text-gray-500 mt-0.5">Request stock for your department. Add several items in one request — the warehouse releases them, then an admin approves before they leave.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => load()} title="Refresh" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setRequesting(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-gray-900 rounded-lg hover:opacity-90"><PackageMinus className="w-4 h-4" /> Request withdrawal</button>
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
                    <span className="text-xs text-gray-400">{itemsSummary(w)}</span>
                  </div>
                  {/* For a batch, list each item under the summary so the requester can see what's on it. */}
                  {w.items && w.items.length > 1 && (
                    <ul className="text-xs text-gray-400 mt-1 space-y-0.5">
                      {w.items.map((it, i) => <li key={i}>• {it.quantity} {it.unit || ''} · {it.itemName}</li>)}
                    </ul>
                  )}
                  {w.reason && <p className="text-xs text-gray-400 mt-0.5">{w.reason}</p>}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-xs font-semibold text-brand-gold">{WD_STATUS_LABEL[w.status] || w.status}</span>
                  <button onClick={() => printWithdrawal(w)} title="Print"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Printer className="w-3.5 h-3.5" /> Print</button>
                </div>
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

// The request form — an add-items table (item + quantity per row), plus one Job Order # and Notes
// for the whole request. No destination (plain withdrawal). A single row = the old single-item flow.
interface FormRow { id: string; inventoryId: string; quantity: string }
let ROW_SEQ = 0;
const emptyRow = (): FormRow => ({ id: `row-${++ROW_SEQ}`, inventoryId: '', quantity: '' });

function RequestModal({ inventory, onSubmit, onClose, onDone }: {
  inventory: InventoryItem[];
  onSubmit: (items: WithdrawItem[], reason: string | null, jobOrderNo: string | null) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<FormRow[]>([emptyRow()]);
  const [reason, setReason] = useState('');
  const [jobOrderNo, setJobOrderNo] = useState('');
  const [saving, setSaving] = useState(false);
  const invById = useMemo(() => new Map(inventory.map(i => [i.id, i])), [inventory]);

  const setRow = (id: string, field: 'inventoryId' | 'quantity', value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const submit = async () => {
    // Validate each filled row; ignore fully-blank rows. At least one valid line required.
    const items: WithdrawItem[] = [];
    for (const r of rows) {
      if (!r.inventoryId && !r.quantity) continue; // skip an empty row
      const qty = Number(r.quantity);
      if (!r.inventoryId) { toast.error('Pick an item for every row'); return; }
      if (!qty || qty <= 0) { toast.error('Enter a quantity for every item'); return; }
      const inv = invById.get(r.inventoryId);
      if (inv && qty > inv.quantity) { toast.error(`Only ${inv.quantity} ${inv.unit || ''} of ${inv.itemName} in stock`); return; }
      items.push({ inventoryId: r.inventoryId, quantity: qty });
    }
    if (!items.length) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try { await onSubmit(items, reason.trim() || null, jobOrderNo.trim() || null); onDone(); }
    catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Request withdrawal</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Items <span className="text-red-500">*</span></label>
              <button onClick={addRow} className="inline-flex items-center gap-1 text-xs font-medium text-brand-gold hover:opacity-80"><Plus className="w-3.5 h-3.5" /> Add item</button>
            </div>
            <div className="space-y-2">
              {rows.map(r => {
                const inv = invById.get(r.inventoryId);
                return (
                  <div key={r.id} className="flex items-start gap-2">
                    <select value={r.inventoryId} onChange={e => setRow(r.id, 'inventoryId', e.target.value)} className={`${input} flex-1`}>
                      <option value="">Select an item…</option>
                      {inventory.map(i => <option key={i.id} value={i.id}>{i.itemName} ({i.quantity} {i.unit || ''} in stock)</option>)}
                    </select>
                    <input type="number" min="1" value={r.quantity} onChange={e => setRow(r.id, 'quantity', e.target.value)}
                      className={`${input} w-24`} placeholder={inv ? `≤ ${inv.quantity}` : 'Qty'} />
                    <button onClick={() => removeRow(r.id)} disabled={rows.length === 1} title="Remove"
                      className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Order # <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={jobOrderNo} onChange={e => setJobOrderNo(e.target.value)} className={input} placeholder="JO-08-001-26" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={input} placeholder="What it's for (optional)" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-gold text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50"><PackageMinus className="w-4 h-4" /> {saving ? 'Requesting…' : 'Request'}</button>
        </div>
      </div>
    </div>
  );
}
