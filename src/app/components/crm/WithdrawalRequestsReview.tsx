import { useEffect, useState } from 'react';
import { Check, X, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { S } from './crmKit';
import { printWithdrawalReceipt } from '../../lib/withdrawalReceiptPrint';

// Production requests stock from the /production portal — either ad-hoc from inventory, or as
// the lines of an approved purchase request. Stock is deducted ONLY here, on approval: the
// backend does it in a transaction that locks the row and re-checks against fresh stock.
interface WithdrawalRequest {
  id: string; withdrawalNumber?: string | null; inventoryId?: string; itemName?: string;
  quantity: number; unit?: string | null; reason?: string;
  requestedByName?: string; status: 'pending' | 'warehouse-approved' | 'approved' | 'rejected';
  purchaseRequestId?: string | null; prNumber?: string | null;
  warehouseBy?: string | null; warehouseAt?: string | null;
  reviewedBy?: string; reviewedAt?: string; deductedAt?: string; createdAt?: string;
}

// Brand-gold text, no pill — the house status style (see crm/PurchaseRequestsReview).
// 'warehouse-approved' would render as "Warehouse-approved"; say what it means instead.
const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting warehouse',
  'warehouse-approved': 'Awaiting you',
  approved: 'Approved',
  rejected: 'Rejected',
};
const statusText = (s: string) => (
  <span style={{ color: '#d1b01b', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
    {STATUS_LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1)}
  </span>
);

// Gold fill, white label, icon first. The classes are load-bearing: `.admin-portal button`
// forces 14px/500 with !important, which beats inline styles (see professional-design-complete.css).
const actionBtn = (busy: boolean): React.CSSProperties => ({
  ...S.rowBtn,
  display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: 0,
  backgroundColor: '#d1b01b', border: '1px solid #d1b01b', color: '#ffffff',
  opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer',
});

export function WithdrawalRequestsReview({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [processing, setProcessing] = useState('');

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      setRows(await fetchApi<WithdrawalRequest[]>(`/inventory-withdrawals${q}`));
    } catch { if (!silent) toast.error('Failed to load withdrawal requests'); }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, [statusFilter]);
  // Paused while an approve/reject is in flight so a poll can't race its refetch.
  useLiveRefresh(() => load({ silent: true }), { enabled: !processing });

  const review = async (w: WithdrawalRequest, status: 'approved' | 'rejected') => {
    const ok = status === 'rejected'
      ? await confirmDialog({ title: `Reject this withdrawal?`, message: `${w.quantity} ${w.unit || ''} of ${w.itemName}. No stock will move.`, confirmLabel: 'Reject', tone: 'danger' })
      : await confirmDialog({ title: `Approve this withdrawal?`, message: `${w.quantity} ${w.unit || ''} of ${w.itemName} will be deducted from inventory immediately.`, confirmLabel: 'Approve' });
    if (!ok) return;
    setProcessing(w.id);
    try {
      const updated = await fetchApi<WithdrawalRequest>(`/inventory-withdrawals/${w.id}/review`, { method: 'PUT', body: JSON.stringify({ status }) });
      setRows(prev => prev.map(r => r.id === w.id ? { ...r, ...updated } : r));
      toast.success(status === 'approved' ? `Approved — ${w.quantity} ${w.unit || ''} of ${w.itemName} deducted` : 'Request rejected');
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setProcessing(''); }
  };

  // Only an approved withdrawal has moved stock, so only that one is worth a receipt.
  const print = async (w: WithdrawalRequest) => {
    const r = await printWithdrawalReceipt(w as any, () => fetchApi(`/inventory-withdrawals/${w.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
  };

  // Only a warehouse-released request is yours to act on — a 'pending' one hasn't been
  // confirmed as physically on the shelf yet, so it isn't "awaiting you" in any useful sense.
  const pending = rows.filter(r => r.status === 'warehouse-approved').length;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Withdrawal Requests</h1>
          <p style={S.sub}>
            The warehouse releases a request first, then you authorise it. Nothing is deducted until you approve — and approving deducts immediately.
            {pending > 0 && <> <strong style={{ color: '#d1b01b' }}>{pending} awaiting you.</strong></>}
          </p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="">All statuses</option>
          <option value="pending">Awaiting warehouse</option>
          <option value="warehouse-approved">Awaiting you</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>WD #</th><th style={S.th}>Item</th><th style={S.th}>Requested by</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Qty</th><th style={S.th}>Reason</th>
            <th style={S.th}>Requested</th><th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={8}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={8}>No withdrawal requests.</td></tr>
              : rows.map(w => (
                <tr key={w.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>
                    {w.withdrawalNumber || '—'}
                    {/* Present when this is one line of a purchase-request fulfilment: the
                        request unlocks only once every one of its lines is approved. */}
                    {w.prNumber && <div style={{ fontWeight: 400, fontSize: '11px', color: '#8a8a8a' }}>for {w.prNumber}</div>}
                  </td>
                  <td style={S.td}>{w.itemName || '—'}</td>
                  <td style={S.td}>{w.requestedByName || '—'}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{w.quantity} {w.unit || ''}</td>
                  <td style={{ ...S.td, maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={w.reason || ''}>{w.reason || '—'}</td>
                  <td style={S.td}>{w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={S.td}>{statusText(w.status)}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      {/* Only once the warehouse has released it. Approving here is what
                          actually deducts the stock, so it must not be reachable before
                          someone has confirmed the stock is really on the shelf. */}
                      {isAdmin && w.status === 'warehouse-approved' && <>
                        <button className="crm-action-btn" style={actionBtn(processing === w.id)} disabled={processing === w.id}
                          onClick={() => review(w, 'approved')}><Check size={13} strokeWidth={3} /> Approve</button>
                        <button className="crm-action-btn" style={actionBtn(processing === w.id)} disabled={processing === w.id}
                          onClick={() => review(w, 'rejected')}><X size={13} strokeWidth={3} /> Reject</button>
                      </>}
                      {w.status === 'pending' && (
                        <span style={{ color: '#8a8a8a', fontSize: '12px' }}>Awaiting the warehouse</span>
                      )}
                      {w.status === 'approved' && (
                        <button className="crm-row-btn" style={{ ...S.rowBtn, marginLeft: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          onClick={() => print(w)}><Printer size={13} /> Receipt</button>
                      )}
                      {w.status === 'rejected' && <span style={{ color: '#8a8a8a', fontSize: '12px' }}>{w.reviewedBy ? `by ${w.reviewedBy}` : '—'}</span>}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
