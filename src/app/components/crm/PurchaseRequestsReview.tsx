import { useEffect, useState } from 'react';
import { Check, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { S, Modal, GhostBtn, PrimaryBtn, badge, peso } from './crmKit';
import { nextDeptFor } from '../../lib/nextDept';

// unitCost/amount are the employee's ESTIMATE; the final* fields are what Purchasing priced
// the line at when they raised the order. Both are kept, so the gap stays auditable.
interface PRItem { no?: number; description: string; quantity: number; unit: string; unitCost: number; amount: number; finalUnitCost?: number | null; finalAmount?: number | null; }
type PRStatus = 'pending' | 'reviewed' | 'verified' | 'ordered' | 'approved' | 'disapproved';
interface PurchaseRequest {
  id: string; prNumber: string; employeeName?: string; projectId?: string | null; projectName?: string | null;
  neededBy?: string; supplier?: string; notes?: string; items: PRItem[]; total: number; finalTotal?: number | null;
  status: PRStatus; withdrawn?: boolean;
  reviewedBy?: string; reviewedAt?: string; checkedBy?: string | null; checkedAt?: string | null;
  verifiedBy?: string | null; verifiedAt?: string | null; createdAt?: string;
}

// Plain brand-gold text, no pill — matching the Production portal's statusPill. This file is
// the inline-style crmKit idiom, so the token's hex is used directly rather than the
// `text-brand-gold` class. Deliberately does NOT call badge(): that helper is shared by every
// other CRM screen and still renders pills there.
const statusBadge = (s: string) => (
  <span style={{ color: '#d1b01b', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
    {s.charAt(0).toUpperCase() + s.slice(1)}
  </span>
);

// A request is "priced" once Purchasing has raised its order and set the real supplier costs.
// Until then only the employee's estimate exists.
const isPriced = (pr: PurchaseRequest) => pr.finalTotal !== null && pr.finalTotal !== undefined;

// Verify / Reject: brand-gold fill, white label, icon first — the house action style.
//
// The 12px/600 below only actually renders because of the `crm-action-btn`/`crm-row-btn`
// classes: `.admin-portal button` in professional-design-complete.css forces 14px/500 with
// !important, which beats inline styles. Changing the numbers here alone does nothing.
// Hover comes from those classes too, for the same reason.
const actionBtn = (busy: boolean): React.CSSProperties => ({
  ...S.rowBtn,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  marginLeft: 0,
  backgroundColor: '#d1b01b',
  border: '1px solid #d1b01b',
  color: '#ffffff',
  opacity: busy ? 0.6 : 1,
  cursor: busy ? 'default' : 'pointer',
});

// The admin's verification gate. Accounting reviews first (/accounting); the admin verifies
// here, which is what lets Purchasing assign a supplier; the admin then approves the resulting
// purchase order under Orders ▸ Purchase Orders — and THAT is what approves the request.
export function PurchaseRequestsReview() {
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // silent: background poll — no spinner, no toast on a blip (see useLiveRefresh).
  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      setRows(await fetchApi<PurchaseRequest[]>(`/purchase-requests${q}`));
    } catch { if (!silent) toast.error('Failed to load purchase requests'); }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, [statusFilter]);
  // Paused while a verify/reject is in flight so a poll can't race its refetch.
  useLiveRefresh(() => load({ silent: true }), { enabled: !busyId });

  const verify = async (pr: PurchaseRequest, action: 'verified' | 'rejected') => {
    const ok = action === 'rejected'
      ? await confirmDialog({ title: `Reject ${pr.prNumber}?`, message: 'The request stops here.', confirmLabel: 'Reject', tone: 'danger' })
      : await confirmDialog({ title: `Verify ${pr.prNumber}?`, message: 'Purchasing can then assign a supplier and raise a purchase order.', confirmLabel: 'Verify' });
    if (!ok) return;
    setBusyId(pr.id);
    try {
      await fetchApi(`/purchase-requests/${pr.id}/verify`, { method: 'PUT', body: JSON.stringify({ action }) });
      toast.success(action === 'verified' ? `${pr.prNumber} verified — Purchasing can now assign a supplier` : `${pr.prNumber} rejected`);
      setSelected(null);
      load();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  // Admin-only hard delete (#2) — clears test rows. The server rejects deleting a request that
  // already has a purchase order raised against it, so the surfaced error explains what to do.
  const removePR = async (pr: PurchaseRequest) => {
    const ok = await confirmDialog({ title: `Delete ${pr.prNumber}?`, message: 'This permanently removes the request from the database.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    setBusyId(pr.id);
    try {
      await fetchApi(`/purchase-requests/${pr.id}`, { method: 'DELETE' });
      toast.success(`${pr.prNumber} deleted`);
      setSelected(null);
      load();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  const pendingVerification = rows.filter(r => r.status === 'reviewed').length;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Purchase Requests</h1>
          <p style={S.sub}>
            Accounting reviews each request first; you <strong>verify</strong> it here, which lets Purchasing assign a supplier.
            You then approve the resulting order under <strong>Orders ▸ Purchase Orders</strong> — that approval is what approves the request.
            {pendingVerification > 0 && <> <strong style={{ color: '#d1b01b' }}>{pendingVerification} awaiting your verification.</strong></>}
          </p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="">All statuses</option>
          <option value="pending">Pending (needs accounting review)</option>
          <option value="reviewed">Reviewed (needs your verification)</option>
          <option value="verified">Verified (needs purchase order)</option>
          <option value="ordered">Ordered (needs admin approval)</option>
          <option value="approved">Approved</option>
          <option value="disapproved">Disapproved</option>
        </select>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>PR #</th><th style={S.th}>Employee</th><th style={S.th}>For</th>
            <th style={S.th}>Items</th><th style={{ ...S.th, textAlign: 'right' }}>Total</th>
            <th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={7}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={7}>No purchase requests.</td></tr>
              : rows.map(pr => (
                <tr key={pr.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{pr.prNumber}</td>
                  <td style={S.td}>{pr.employeeName || '—'}</td>
                  <td style={S.td}>{pr.projectName || 'Personal use'}</td>
                  <td style={S.td}>{pr.items?.length || 0}</td>
                  {/* Shows the FINAL price once Purchasing has set it, with the superseded
                      estimate beneath — the admin approves against the real number. */}
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#000000' }}>
                    {peso(isPriced(pr) ? (pr.finalTotal ?? 0) : pr.total)}
                    {isPriced(pr) && (
                      <div style={{ fontWeight: 400, fontSize: '11px', color: '#8a8a8a', textDecoration: 'line-through' }}>{peso(pr.total)}</div>
                    )}
                  </td>
                  <td style={S.td}>
                    {statusBadge(pr.status)}{pr.withdrawn ? <span style={{ marginLeft: '6px' }}>{badge('Withdrawn', '#7a6a0c', '#ececec')}</span> : null}
                    {nextDeptFor(pr.status, 'pr') && <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '2px' }}>{nextDeptFor(pr.status, 'pr')}</div>}
                  </td>
                  <td style={S.td}>
                    {/* Flex rather than inline buttons: an inline-flex button (icon + label) and a
                        plain inline one align on different baselines, which visibly staggers them. */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button className="crm-row-btn" style={{ ...S.rowBtn, marginLeft: 0 }} onClick={() => setSelected(pr)}>View</button>
                      {pr.status === 'reviewed' && (
                        <>
                          <button className="crm-action-btn" style={actionBtn(busyId === pr.id)} disabled={busyId === pr.id}
                            onClick={() => verify(pr, 'verified')}><Check size={13} strokeWidth={3} /> Verify</button>
                          <button className="crm-action-btn" style={actionBtn(busyId === pr.id)} disabled={busyId === pr.id}
                            onClick={() => verify(pr, 'rejected')}><X size={13} strokeWidth={3} /> Reject</button>
                        </>
                      )}
                      <button className="crm-row-btn" title="Delete request" style={{ ...S.rowBtn, marginLeft: 0, color: '#dc2626' }} disabled={busyId === pr.id}
                        onClick={() => removePR(pr)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={`${selected.prNumber} — ${selected.employeeName || 'Employee'}`} onClose={() => setSelected(null)} wide
          footer={selected.status === 'reviewed' ? (
            <>
              <GhostBtn onClick={() => verify(selected, 'rejected')}>Reject</GhostBtn>
              <PrimaryBtn onClick={() => verify(selected, 'verified')} disabled={busyId === selected.id}>
                {busyId === selected.id ? 'Verifying…' : 'Verify Request'}
              </PrimaryBtn>
            </>
          ) : <GhostBtn onClick={() => setSelected(null)}>Close</GhostBtn>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '14px' }}>
            <div><div style={S.label}>For</div>{selected.projectName || 'Personal use'}</div>
            <div><div style={S.label}>Status</div>{statusBadge(selected.status)}</div>
            <div><div style={S.label}>Prepared by</div>{selected.employeeName || '—'}</div>
            <div><div style={S.label}>Reviewed by (Accounting)</div>{selected.checkedBy || '—'}</div>
            {/* One admin field, not two. This is verified_by — filled the moment you verify —
                and it is what the printed "Approved By" block shows. The separate reviewed_by
                (set when the resulting purchase order is approved) is surfaced under
                Orders ▸ Purchase Orders instead; two "Admin" rows here read as a bug. */}
            <div><div style={S.label}>Approved by (Admin)</div>{selected.verifiedBy || '—'}</div>
            <div><div style={S.label}>Needed by</div>{selected.neededBy ? new Date(selected.neededBy).toLocaleDateString() : '—'}</div>
            <div><div style={S.label}>Supplier</div>{selected.supplier || '—'}</div>
          </div>
          <div style={{ ...S.label, marginBottom: '6px' }}>Items</div>
          <table style={{ ...S.table, marginBottom: '12px' }}>
            <thead><tr>
              <th style={S.th}>Description</th><th style={S.th}>Qty</th><th style={S.th}>Unit</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Est. Cost</th>
              {isPriced(selected) && <th style={{ ...S.th, textAlign: 'right' }}>Final Cost</th>}
              <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {selected.items.map((it, idx) => {
                const priced = isPriced(selected);
                return (
                  <tr key={idx}>
                    <td style={S.td}>{it.description}</td><td style={S.td}>{it.quantity}</td><td style={S.td}>{it.unit}</td>
                    {/* Once Purchasing has priced it, the estimate greys out — it is history. */}
                    <td style={{ ...S.td, textAlign: 'right', color: priced ? '#8a8a8a' : undefined }}>{peso(it.unitCost)}</td>
                    {priced && <td style={{ ...S.td, textAlign: 'right' }}>{peso(it.finalUnitCost ?? 0)}</td>}
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{peso(priced ? (it.finalAmount ?? 0) : it.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', fontWeight: 700, color: '#000000' }}>
            {isPriced(selected) && (
              <span style={{ fontWeight: 400, color: '#8a8a8a', marginRight: '12px' }}>
                Estimate: <span style={{ textDecoration: 'line-through' }}>{peso(selected.total)}</span>
              </span>
            )}
            {isPriced(selected) ? 'Final total' : 'Total'}: {peso(isPriced(selected) ? (selected.finalTotal ?? 0) : selected.total)}
          </div>
          {selected.notes && <div style={{ marginTop: '12px' }}><div style={S.label}>Notes</div><p style={{ fontSize: '14px', color: '#262626' }}>{selected.notes}</p></div>}
        </Modal>
      )}
    </div>
  );
}
