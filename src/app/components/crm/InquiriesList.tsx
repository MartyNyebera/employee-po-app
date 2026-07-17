import { useEffect, useState } from 'react';
import { Plus, Search, ArrowRightCircle } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, TextArea, PrimaryBtn, GhostBtn, badge, peso } from './crmKit';

interface Inquiry {
  id: string; inquiryDate: string; customerId?: string; customerName?: string; contact?: string;
  whatTheyWant?: string; line?: string; source?: string; status?: string; quoteAmount?: number | null;
  supplierId?: string; supplierName?: string; supplierQuoteAmount?: number | null; margin?: number | null;
  followUpDate?: string; salesOrderId?: string; purchaseOrderId?: string; notes?: string;
}
interface Ref { id: string; name: string }

const SOURCES = ['Referral', 'Facebook', 'Marketplace', 'Ad', 'Walk-in', 'Website', 'Existing contact'];
const STATUSES = ['New', 'Quoted', 'Won', 'Lost', 'Follow-up'];
const LINES = ['Sheet metal (panels)', 'Sheet metal (branded)', 'Trading (electrical)', 'Trading (mechanical)', 'Fabrication (subcon)'];

const statusBadge = (s?: string) => {
  if (s === 'Won') return badge(s, '#065f46', '#d1fae5');
  if (s === 'Quoted') return badge(s, '#7a6a0c', '#ececec');
  if (s === 'New') return badge(s, '#92400e', '#fef3c7');
  if (s === 'Follow-up') return badge(s, '#b0940f', '#ececec');
  if (s === 'Lost') return badge(s, '#991b1b', '#fee2e2');
  return <span style={{ color: '#8a8a8a' }}>—</span>;
};

export function InquiriesList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [customers, setCustomers] = useState<Ref[]>([]);
  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Inquiry | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [converting, setConverting] = useState<Inquiry | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Inquiry[]>('/inquiries')); }
    catch { toast.error('Failed to load quotations'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // Best-effort: dropdown sources (may be empty/403 for some roles — form falls back to free text)
    fetchApi<Ref[]>('/customers').then(setCustomers).catch(() => setCustomers([]));
    fetchApi<Ref[]>('/suppliers').then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || (r.customerName || '').toLowerCase().includes(q) || (r.whatTheyWant || '').toLowerCase().includes(q) || (r.supplierName || '').toLowerCase().includes(q);
    const matchS = !statusFilter || r.status === statusFilter;
    return matchQ && matchS;
  });

  const customerLabel = (r: Inquiry) => r.customerName || customers.find(c => c.id === r.customerId)?.name || '—';
  const supplierLabel = (r: Inquiry) => r.supplierName || suppliers.find(s => s.id === r.supplierId)?.name || '—';

  const onDelete = async (r: Inquiry) => {
    if (!(await confirmDialog({ title: 'Delete this quotation?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(x => x.id !== r.id));
    try { await fetchApi(`/inquiries/${r.id}`, { method: 'DELETE' }); toast.success('Quotation deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Inquiries / Quotations</h1><p style={S.sub}>Client asks → we get a supplier quote → we quote the client. The gap is the margin.</p></div>
        {isAdmin && <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />New Quotation</button>}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#8a8a8a' }} />
          <input placeholder="Search by client, part or supplier…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: '36px' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="">All statuses</option>
          {STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Client</th><th style={S.th}>Part requested</th><th style={S.th}>Supplier</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Supplier quote</th><th style={{ ...S.th, textAlign: 'right' }}>Our quote</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Margin</th><th style={S.th}>Source</th><th style={S.th}>Status</th>
            {isAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={9}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={9}>No quotations yet.</td></tr>
              : filtered.map(r => {
                const margin = (r.quoteAmount != null && r.supplierQuoteAmount != null) ? r.quoteAmount - r.supplierQuoteAmount : null;
                return (
                  <tr key={r.id}>
                    <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{customerLabel(r)}</td>
                    <td style={{ ...S.td, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.whatTheyWant || '—'}{r.line ? <div style={{ fontSize: '12px', color: '#8a8a8a' }}>{r.line}</div> : null}</td>
                    <td style={S.td}>{supplierLabel(r)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{peso(r.supplierQuoteAmount)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{peso(r.quoteAmount)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: margin == null ? '#8a8a8a' : margin >= 0 ? '#059669' : '#dc2626' }}>{margin == null ? '—' : peso(margin)}</td>
                    <td style={S.td}>{r.source || '—'}</td>
                    <td style={S.td}>{statusBadge(r.status)}</td>
                    {isAdmin && <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.salesOrderId
                        ? badge('Converted', '#065f46', '#d1fae5')
                        : <button style={{ ...S.rowBtn, color: '#d1b01b', borderColor: '#e8d89a' }} onClick={() => setConverting(r)}><ArrowRightCircle size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />Convert</button>}
                      <button style={S.rowBtn} onClick={() => { setEditing(r); setShowModal(true); }}>Edit</button>
                      <button style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(r)}>Delete</button>
                    </td>}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {showModal && <InquiryModal initial={editing} customers={customers} suppliers={suppliers} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      {converting && <ConvertModal inquiry={converting} supplierLabel={supplierLabel(converting)} customerLabel={customerLabel(converting)} onClose={() => setConverting(null)} onDone={() => { setConverting(null); load(); }} />}
    </div>
  );
}

function InquiryModal({ initial, customers, suppliers, onClose, onSaved }: { initial: Inquiry | null; customers: Ref[]; suppliers: Ref[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Inquiry>(initial || { id: '', inquiryDate: today, status: 'New' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Inquiry, v: any) => setF(p => ({ ...p, [k]: v }));
  const margin = (f.quoteAmount != null && f.supplierQuoteAmount != null && f.quoteAmount !== ('' as any) && f.supplierQuoteAmount !== ('' as any))
    ? Number(f.quoteAmount) - Number(f.supplierQuoteAmount) : null;

  const save = async () => {
    if (!f.inquiryDate) { toast.error('Inquiry date is required'); return; }
    if (!f.customerId && !f.customerName) { toast.error('Pick a customer or type a name'); return; }
    setSaving(true);
    try {
      const body = { ...f, quoteAmount: f.quoteAmount === ('' as any) ? null : f.quoteAmount, supplierQuoteAmount: f.supplierQuoteAmount === ('' as any) ? null : f.supplierQuoteAmount };
      if (initial) await fetchApi(`/inquiries/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await fetchApi('/inquiries', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Quotation updated' : 'Quotation added');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Quotation' : 'New Quotation'} onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Inquiry date *"><TextInput type="date" value={(f.inquiryDate || '').slice(0, 10)} onChange={e => set('inquiryDate', e.target.value)} /></Field>
        <Field label="Source"><Select value={f.source || ''} onChange={v => set('source', v)} options={SOURCES} /></Field>
        <Field label="Customer (existing)">
          <select value={f.customerId || ''} onChange={e => set('customerId', e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
            <option value="">— or type a new name below —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="…or new customer name"><TextInput value={f.customerName || ''} onChange={e => set('customerName', e.target.value)} placeholder="Brand-new lead" /></Field>
        <Field label="Contact"><TextInput value={f.contact || ''} onChange={e => set('contact', e.target.value)} /></Field>
        <Field label="Trading line"><Select value={f.line || ''} onChange={v => set('line', v)} options={LINES} /></Field>
      </div>
      <Field label="What they want"><TextArea value={f.whatTheyWant || ''} onChange={e => set('whatTheyWant', e.target.value)} placeholder="Part / product the client is asking for" /></Field>

      <div style={{ background: '#ececec', border: '1px solid #d6d6d6', borderRadius: '10px', padding: '14px 16px', margin: '6px 0 14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#262626', marginBottom: '10px' }}>QUOTES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Field label="Supplier (we called)">
            <select value={f.supplierId || ''} onChange={e => set('supplierId', e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
              <option value="">— or type below —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="…or supplier name"><TextInput value={f.supplierName || ''} onChange={e => set('supplierName', e.target.value)} /></Field>
          <Field label="Supplier quote (our cost) ₱"><TextInput type="number" value={f.supplierQuoteAmount ?? ''} onChange={e => set('supplierQuoteAmount', e.target.value)} /></Field>
          <Field label="Our quote to client ₱"><TextInput type="number" value={f.quoteAmount ?? ''} onChange={e => set('quoteAmount', e.target.value)} /></Field>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: margin == null ? '#8a8a8a' : margin >= 0 ? '#059669' : '#dc2626' }}>
          Margin: {margin == null ? '—' : peso(margin)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Status"><Select value={f.status || ''} onChange={v => set('status', v)} options={STATUSES} /></Field>
        <Field label="Follow-up date"><TextInput type="date" value={(f.followUpDate || '').slice(0, 10)} onChange={e => set('followUpDate', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><TextArea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}

function ConvertModal({ inquiry, supplierLabel, customerLabel, onClose, onDone }: { inquiry: Inquiry; supplierLabel: string; customerLabel: string; onClose: () => void; onDone: () => void }) {
  const canPO = !!(inquiry.supplierId || inquiry.supplierName) && inquiry.supplierQuoteAmount != null;
  const [raisePO, setRaisePO] = useState(canPO);
  const [busy, setBusy] = useState(false);
  const margin = (inquiry.quoteAmount != null && inquiry.supplierQuoteAmount != null) ? inquiry.quoteAmount - inquiry.supplierQuoteAmount : null;

  const go = async () => {
    setBusy(true);
    try {
      const res: any = await fetchApi(`/inquiries/${inquiry.id}/convert`, { method: 'POST', body: JSON.stringify({ raisePurchaseOrder: raisePO }) });
      const so = res.salesOrder?.soNumber || res.salesOrder?.id;
      const po = res.purchaseOrder?.poNumber || res.purchaseOrder?.id;
      toast.success(`Converted → Sales Order ${so}` + (po ? ` + Purchase Order ${po}` : ''));
      onDone();
    } catch (e: any) { toast.error('Convert failed: ' + e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Convert to Sales Order" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={go} disabled={busy}>{busy ? 'Converting…' : 'Convert'}</PrimaryBtn></>}>
      <p style={{ fontSize: '14px', color: '#262626', marginTop: 0 }}>
        This creates a <strong>Sales Order</strong> to <strong>{customerLabel}</strong> for <strong>{peso(inquiry.quoteAmount)}</strong>
        {inquiry.supplierQuoteAmount != null && <> (cost recorded {peso(inquiry.supplierQuoteAmount)}, margin {peso(margin)})</>} and marks this quotation <strong>Won</strong>.
      </p>
      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', border: '1px solid #d6d6d6', borderRadius: '10px', cursor: canPO ? 'pointer' : 'not-allowed', opacity: canPO ? 1 : 0.5 }}>
        <input type="checkbox" checked={raisePO} disabled={!canPO} onChange={e => setRaisePO(e.target.checked)} style={{ marginTop: '2px' }} />
        <span style={{ fontSize: '14px', color: '#262626' }}>
          Also raise a <strong>Purchase Order</strong> to <strong>{supplierLabel}</strong> for <strong>{peso(inquiry.supplierQuoteAmount)}</strong>
          {!canPO && <span style={{ display: 'block', fontSize: '12px', color: '#8a8a8a' }}>Add a supplier and supplier quote to enable this.</span>}
        </span>
      </label>
      <p style={{ fontSize: '12px', color: '#8a8a8a', marginBottom: 0 }}>You can still adjust the client price on the Sales Order afterwards.</p>
    </Modal>
  );
}
