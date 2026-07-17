import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, TextArea, PrimaryBtn, GhostBtn, badge } from './crmKit';

interface Customer {
  id: string; name: string; type?: string; contactPerson?: string; phone?: string; email?: string;
  location?: string; whatTheyBuy?: string; source?: string; status?: string; lastContact?: string; notes?: string;
}

const TYPES = ['Contractor', 'Builder', 'Factory', 'Distributor', 'Maintenance', 'Other'];
const SOURCES = ['Referral', 'Facebook', 'Marketplace', 'Ad', 'Walk-in', 'Website', 'Existing contact'];
const STATUSES = ['Lead', 'Active', 'Repeat', 'Inactive'];

const statusBadge = (s?: string) => {
  if (s === 'Active') return badge(s, '#065f46', '#d1fae5');
  if (s === 'Repeat') return badge(s, '#7a6a0c', '#ececec');
  if (s === 'Lead') return badge(s, '#92400e', '#fef3c7');
  if (s === 'Inactive') return badge(s, '#5a5a5a', '#e6e6e6');
  return <span style={{ color: '#8a8a8a' }}>—</span>;
};

export function CustomersList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Customer[]>('/customers')); }
    catch { toast.error('Failed to load customers'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.name.toLowerCase().includes(q) || (r.contactPerson || '').toLowerCase().includes(q);
    const matchS = !statusFilter || r.status === statusFilter;
    return matchQ && matchS;
  });

  const onDelete = async (c: Customer) => {
    if (!(await confirmDialog({ title: `Delete customer "${c.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(r => r.id !== c.id));
    try { await fetchApi(`/customers/${c.id}`, { method: 'DELETE' }); toast.success('Customer deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Customers</h1><p style={S.sub}>Who we sell to — contractors, builders, factories, distributors.</p></div>
        {isAdmin && <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Add Customer</button>}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#8a8a8a' }} />
          <input placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, paddingLeft: '36px' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
          <option value="">All statuses</option>
          {STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Type</th><th style={S.th}>Contact</th>
            <th style={S.th}>Buys</th><th style={S.th}>Source</th><th style={S.th}>Status</th>
            {isAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={7}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={7}>No customers yet.</td></tr>
              : filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{c.name}</td>
                  <td style={S.td}>{c.type || '—'}</td>
                  <td style={S.td}>{c.contactPerson || '—'}{c.phone ? <div style={{ fontSize: '12px', color: '#8a8a8a' }}>{c.phone}</div> : null}</td>
                  <td style={{ ...S.td, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.whatTheyBuy || '—'}</td>
                  <td style={S.td}>{c.source || '—'}</td>
                  <td style={S.td}>{statusBadge(c.status)}</td>
                  {isAdmin && <td style={{ ...S.td, textAlign: 'right' }}>
                    <button style={S.rowBtn} onClick={() => { setEditing(c); setShowModal(true); }}>Edit</button>
                    <button style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(c)}>Delete</button>
                  </td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <CustomerModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function CustomerModal({ initial, onClose, onSaved }: { initial: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Customer>(initial || { id: '', name: '', status: 'Lead' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Customer, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name?.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (initial) await fetchApi(`/customers/${initial.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      else await fetchApi('/customers', { method: 'POST', body: JSON.stringify(f) });
      toast.success(initial ? 'Customer updated' : 'Customer added');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Customer' : 'Add Customer'} onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Name *"><TextInput value={f.name || ''} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Type"><Select value={f.type || ''} onChange={v => set('type', v)} options={TYPES} /></Field>
        <Field label="Contact person"><TextInput value={f.contactPerson || ''} onChange={e => set('contactPerson', e.target.value)} /></Field>
        <Field label="Phone"><TextInput value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Email"><TextInput value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Location"><TextInput value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
        <Field label="What they buy"><TextInput value={f.whatTheyBuy || ''} onChange={e => set('whatTheyBuy', e.target.value)} /></Field>
        <Field label="Source"><Select value={f.source || ''} onChange={v => set('source', v)} options={SOURCES} /></Field>
        <Field label="Status"><Select value={f.status || ''} onChange={v => set('status', v)} options={STATUSES} /></Field>
        <Field label="Last contact"><TextInput type="date" value={(f.lastContact || '').slice(0, 10)} onChange={e => set('lastContact', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><TextArea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}
