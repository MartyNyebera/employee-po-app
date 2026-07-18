import { useEffect, useState } from 'react';
import { Check, X, Trash2, Printer, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { S, badge, peso, toneText, Modal, Field, TextInput, TextArea, GhostBtn, PrimaryBtn } from './crmKit';
import { printPurchaseRequest } from '../../lib/purchaseRequestPrint';
import { nextDeptFor } from '../../lib/nextDept';
import { SummaryStats } from '../SummaryStats';

// unitCost/amount are the employee's ESTIMATE; the final* fields are what Purchasing priced
// the line at when they raised the order. Both are kept, so the gap stays auditable.
interface PRItem { no?: number; description: string; quantity: number; unit: string; unitCost: number; amount: number; finalUnitCost?: number | null; finalAmount?: number | null; kind?: string | null; laborNote?: string | null; }
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
  <span style={{ color: toneText(s), fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
    {s.charAt(0).toUpperCase() + s.slice(1)}
  </span>
);

// A request is "priced" once Purchasing has raised its order and set the real supplier costs.
// Until then only the employee's estimate exists.
const isPriced = (pr: PurchaseRequest) => pr.finalTotal !== null && pr.finalTotal !== undefined;

// The admin's verification gate. Accounting reviews first (/accounting); the admin verifies
// here, which is what lets Purchasing assign a supplier; the admin then approves the resulting
// purchase order under Orders ▸ Purchase Orders — and THAT is what approves the request.
export function PurchaseRequestsReview() {
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PurchaseRequest | null>(null);

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
      load();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  // #2 — print the PURCHASE REQUEST document (shared with the production portal). Signatures come
  // from the admin-authed endpoint (the guard admits 'admin').
  const printPR = async (pr: PurchaseRequest) => {
    const r = await printPurchaseRequest(pr as any, () => fetchApi(`/purchase-requests/${pr.id}/signatures`));
    if (!r.ok) toast.error(r.error || 'Failed to open the print window');
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
      load();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(null); }
  };

  const pendingVerification = rows.filter(r => r.status === 'reviewed').length;
  const prCount = (s: string) => rows.filter(r => r.status === s).length;

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

      <SummaryStats items={[
        { label: 'Total', value: rows.length },
        { label: 'Pending', value: prCount('pending') },
        { label: 'Reviewed', value: prCount('reviewed'), accent: true },
        { label: 'Verified', value: prCount('verified') },
        { label: 'Ordered', value: prCount('ordered') },
        { label: 'Approved', value: prCount('approved') },
      ]} />

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
                      <button className="crm-row-btn" title="Print" style={{ ...S.rowBtn, marginLeft: 0 }} onClick={() => printPR(pr)}><Printer size={13} /></button>
                      {/* Same styling as the Sales/Purchase Order action buttons: crm-row-btn
                          pills — gold fill + black check for Verify, red X on white for Reject. */}
                      {pr.status === 'reviewed' && (
                        <>
                          <button className="crm-row-btn" title="Verify" style={{ ...S.rowBtn, marginLeft: 0, backgroundColor: '#d1b01b', border: '1px solid #d1b01b', color: '#000000' }} disabled={busyId === pr.id}
                            onClick={() => verify(pr, 'verified')}><Check size={13} /></button>
                          <button className="crm-row-btn" title="Reject" style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} disabled={busyId === pr.id}
                            onClick={() => verify(pr, 'rejected')}><X size={13} /></button>
                        </>
                      )}
                      {/* #3 — only a disapproved request can be corrected and re-submitted. */}
                      {pr.status === 'disapproved' && (
                        <button className="crm-row-btn" title="Edit" style={{ ...S.rowBtn, marginLeft: 0 }} disabled={busyId === pr.id}
                          onClick={() => setEditing(pr)}><Pencil size={13} /></button>
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

      {editing && (
        <PREditModal
          pr={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// #3 — correct a DISAPPROVED request's lines, needed-by and notes, then re-submit. Saving PATCHes
// the request, which the server resets to 'pending' so it re-enters the review pipeline. The
// project link is preserved (sent back unchanged). Labor lines keep their kind/note.
interface EditLine { description: string; quantity: string; unit: string; unitCost: string; kind?: string | null; laborNote?: string | null; }
function PREditModal({ pr, onClose, onSaved }: { pr: PurchaseRequest; onClose: () => void; onSaved: () => void }) {
  const [neededBy, setNeededBy] = useState((pr.neededBy || '').slice(0, 10));
  const [notes, setNotes] = useState(pr.notes || '');
  const [lines, setLines] = useState<EditLine[]>(() => (pr.items || []).map(it => ({
    description: it.description, quantity: String(it.quantity ?? ''), unit: it.unit || (it.kind === 'labor' ? 'lot' : 'pcs'),
    unitCost: String(it.unitCost ?? ''), kind: it.kind ?? null, laborNote: it.laborNote ?? null,
  })));
  const [saving, setSaving] = useState(false);

  const setCell = (i: number, k: keyof EditLine, v: string) => setLines(g => g.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeLine = (i: number) => setLines(g => g.filter((_, idx) => idx !== i));
  const total = lines.reduce((t, l) => t + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const save = async () => {
    const items = lines
      .filter(l => l.description.trim() && Number(l.quantity) > 0)
      .map((l, i) => ({
        no: i + 1, kind: l.kind || undefined, description: l.description.trim(),
        laborNote: l.kind === 'labor' ? ((l.laborNote || '').trim() || null) : undefined,
        quantity: Number(l.quantity) || 0, unit: l.unit,
        unitCost: Number(l.unitCost) || 0, amount: (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
      }));
    if (items.length === 0) { toast.error('At least one item with a description and quantity is required'); return; }
    if (!neededBy) { toast.error('Set the needed-by date'); return; }
    setSaving(true);
    try {
      await fetchApi(`/purchase-requests/${pr.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ items, neededBy, projectId: pr.projectId ?? null, notes: notes.trim() || null }),
      });
      toast.success(`${pr.prNumber} updated — re-submitted for review`);
      onSaved();
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Edit ${pr.prNumber}`} onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & re-submit'}</PrimaryBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Needed by"><TextInput type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} /></Field>
        <Field label="Project"><TextInput value={pr.projectName || 'Personal use'} onChange={() => {}} disabled /></Field>
      </div>
      <div style={{ marginTop: '4px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#5a5a5a', marginBottom: '6px' }}>Items</div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Description</th>
            <th style={{ ...S.th, textAlign: 'right', width: '70px' }}>Qty</th>
            <th style={{ ...S.th, width: '90px' }}>Unit</th>
            <th style={{ ...S.th, textAlign: 'right', width: '110px' }}>Unit cost</th>
            <th style={{ ...S.th, textAlign: 'right', width: '110px' }}>Amount</th>
            <th style={{ ...S.th, width: '36px' }}></th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={S.td}>
                  <TextInput value={l.description} onChange={e => setCell(i, 'description', e.target.value)} />
                  {l.kind === 'labor' && <div style={{ marginTop: '4px' }}><TextInput value={l.laborNote || ''} onChange={e => setCell(i, 'laborNote', e.target.value)} placeholder="Labor note" /></div>}
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>{l.kind === 'labor' ? <span style={{ color: '#8a8a8a' }}>—</span> : <TextInput type="number" value={l.quantity} onChange={e => setCell(i, 'quantity', e.target.value)} />}</td>
                <td style={S.td}>{l.kind === 'labor' ? <span style={{ color: '#8a8a8a' }}>lot</span> : <TextInput value={l.unit} onChange={e => setCell(i, 'unit', e.target.value)} />}</td>
                <td style={{ ...S.td, textAlign: 'right' }}><TextInput type="number" value={l.unitCost} onChange={e => setCell(i, 'unitCost', e.target.value)} /></td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#000000' }}>{peso((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>
                  {lines.length > 1 && <button title="Remove line" style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} onClick={() => removeLine(i)}><Trash2 size={13} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', alignItems: 'center', marginTop: '8px' }}>
          <button style={{ ...S.rowBtn, marginLeft: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            onClick={() => setLines(g => [...g, { description: '', quantity: '1', unit: 'pcs', unitCost: '' }])}><Plus size={13} /> Add line</button>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#000000' }}>Total: {peso(total)}</div>
        </div>
      </div>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}
