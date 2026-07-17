import { useEffect, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, TextArea, PrimaryBtn, GhostBtn, badge } from './crmKit';

interface Supplier {
  id: string; name: string; type?: string; productsSupplied?: string; contactPerson?: string;
  phone?: string; email?: string; location?: string; paymentTerms?: string;
  priceLevel?: string; reliability?: string; lastOrdered?: string; notes?: string;
  tin?: string;
  // Read-only here. The scan is uploaded/replaced from the purchasing portal via its own
  // route; this form never holds the document, so saving here cannot clobber it.
  hasCertificate?: boolean;
}

const TYPES = ['Electrical parts', 'Mechanical parts', 'Both', 'Fabrication (subcon)', 'Raw materials'];
const PRICE = ['Cheap', 'Average', 'Expensive'];
const RELIABILITY = ['Excellent', 'Good', 'OK', 'Poor'];

const relBadge = (r?: string) => {
  if (r === 'Excellent') return badge(r, '#065f46', '#d1fae5');
  if (r === 'Good') return badge(r, '#7a6a0c', '#ececec');
  if (r === 'OK') return badge(r, '#92400e', '#fef3c7');
  if (r === 'Poor') return badge(r, '#991b1b', '#fee2e2');
  return <span style={{ color: '#8a8a8a' }}>—</span>;
};

export function SuppliersList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Supplier[]>('/suppliers')); }
    catch (e: any) { toast.error('Failed to load suppliers'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.name.toLowerCase().includes(q) || (r.contactPerson || '').toLowerCase().includes(q) || (r.productsSupplied || '').toLowerCase().includes(q);
    const matchT = !typeFilter || r.type === typeFilter;
    return matchQ && matchT;
  });

  const onDelete = async (s: Supplier) => {
    if (!(await confirmDialog({ title: `Delete supplier "${s.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(r => r.id !== s.id));
    try { await fetchApi(`/suppliers/${s.id}`, { method: 'DELETE' }); toast.success('Supplier deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Suppliers</h1><p style={S.sub}>Who we buy from — parts, fabrication, raw materials.</p></div>
        {/* Admin cannot add suppliers from the admin portal (#10). */}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#8a8a8a' }} />
          <input placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: '36px' }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Type</th><th style={S.th}>Products</th>
            <th style={S.th}>Contact</th><th style={S.th}>TIN</th><th style={S.th}>Price</th><th style={S.th}>Reliability</th>
            {isAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={8}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={8}>No suppliers yet.</td></tr>
              : filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>
                    {s.name}
                    {s.hasCertificate ? <div style={{ fontSize: '11px', fontWeight: 400, color: '#b0940f' }}>Certificate on file</div> : null}
                  </td>
                  <td style={S.td}>{s.type || '—'}</td>
                  <td style={{ ...S.td, maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.productsSupplied || '—'}</td>
                  <td style={S.td}>{s.contactPerson || '—'}{s.phone ? <div style={{ fontSize: '12px', color: '#8a8a8a' }}>{s.phone}</div> : null}</td>
                  <td style={S.td}>{s.tin || '—'}</td>
                  <td style={S.td}>{s.priceLevel || '—'}</td>
                  <td style={S.td}>{relBadge(s.reliability)}</td>
                  {isAdmin && <td style={{ ...S.td, textAlign: 'right' }}>
                    <button style={S.rowBtn} onClick={() => { setEditing(s); setShowModal(true); }}>Edit</button>
                    <button title="Delete" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(s)}><Trash2 size={14} /></button>
                  </td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <SupplierModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function SupplierModal({ initial, onClose, onSaved }: { initial: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Supplier>(initial || { id: '', name: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Supplier, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name?.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (initial) await fetchApi(`/suppliers/${initial.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      else await fetchApi('/suppliers', { method: 'POST', body: JSON.stringify(f) });
      toast.success(initial ? 'Supplier updated' : 'Supplier added');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Supplier' : 'Add Supplier'} onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Name *"><TextInput value={f.name || ''} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Type"><Select value={f.type || ''} onChange={v => set('type', v)} options={TYPES} /></Field>
        <Field label="Products supplied"><TextInput value={f.productsSupplied || ''} onChange={e => set('productsSupplied', e.target.value)} /></Field>
        <Field label="Contact person"><TextInput value={f.contactPerson || ''} onChange={e => set('contactPerson', e.target.value)} /></Field>
        <Field label="Phone"><TextInput value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Email"><TextInput value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Location"><TextInput value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
        <Field label="Payment terms"><TextInput value={f.paymentTerms || ''} onChange={e => set('paymentTerms', e.target.value)} /></Field>
        <Field label="Price level"><Select value={f.priceLevel || ''} onChange={v => set('priceLevel', v)} options={PRICE} /></Field>
        <Field label="Reliability"><Select value={f.reliability || ''} onChange={v => set('reliability', v)} options={RELIABILITY} /></Field>
        <Field label="Last ordered"><TextInput type="date" value={(f.lastOrdered || '').slice(0, 10)} onChange={e => set('lastOrdered', e.target.value)} /></Field>
        <Field label="TIN number"><TextInput value={f.tin || ''} onChange={e => set('tin', e.target.value)} placeholder="000-000-000-000" /></Field>
      </div>
      <Field label="Notes"><TextArea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}
