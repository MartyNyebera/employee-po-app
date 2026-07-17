import { useEffect, useState } from 'react';
import { Plus, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, PrimaryBtn, GhostBtn, badge } from './crmKit';

interface Staff { id: string; email: string; name: string; role: string; isActive?: boolean; isSuperAdmin?: boolean; createdAt?: string; }

// 'purchasing' is intentionally omitted — purchasing staff now use dedicated Purchasing
// Accounts (see the Purchasing Accounts tab) and sign into the /purchasing portal.
const ROLES = ['admin', 'bookkeeper', 'office_admin'];
const roleBadge = (r: string) => r === 'admin' ? badge('Admin', '#7a6a0c', '#ececec') : r === 'bookkeeper' ? badge('Bookkeeper', '#065f46', '#d1fae5') : r === 'purchasing' ? badge('Purchasing', '#92400e', '#fef3c7') : r === 'office_admin' ? badge('Office Admin', '#7a6a0c', '#ececec') : badge(r, '#262626', '#e6e6e6');

export function StaffAccountsList() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Staff[]>('/staff')); }
    catch { toast.error('Failed to load staff accounts'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (s: Staff) => {
    const prev = rows; setRows(rows.map(x => x.id === s.id ? { ...x, isActive: !s.isActive } : x));
    try { await fetchApi(`/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) }); toast.success(s.isActive ? 'Account deactivated' : 'Account reactivated'); }
    catch { setRows(prev); toast.error('Update failed'); }
  };

  const onDelete = async (s: Staff) => {
    if (!(await confirmDialog({ title: `Permanently delete staff account "${s.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(x => x.id !== s.id));
    try { await fetchApi(`/staff/${s.id}`, { method: 'DELETE' }); toast.success('Staff account deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Administrator Accounts</h1><p style={S.sub}>Create and manage admin-side logins. Bookkeeper and Purchasing get filtered dashboards.</p></div>
        <button style={S.addBtn} onClick={() => setShowModal(true)}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />New Staff</button>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Email</th><th style={S.th}>Role</th><th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={5}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={5}>No staff accounts yet.</td></tr>
              : rows.map(s => (
                <tr key={s.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{s.name}{s.isSuperAdmin ? <span style={{ marginLeft: '8px' }}>{badge('Owner', '#b0940f', '#ececec')}</span> : null}</td>
                  <td style={S.td}>{s.email}</td>
                  <td style={S.td}>{roleBadge(s.role)}</td>
                  <td style={S.td}>{s.isActive === false ? badge('Inactive', '#991b1b', '#fee2e2') : badge('Active', '#065f46', '#d1fae5')}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    {s.isSuperAdmin ? <span style={{ color: '#8a8a8a', fontSize: '12px' }}>—</span>
                      : <>
                        <button title={s.isActive === false ? 'Reactivate' : 'Deactivate'} style={{ ...S.rowBtn, color: s.isActive === false ? '#7a6a0c' : '#b91c1c' }} onClick={() => toggleActive(s)}><Power size={13} /></button>
                        <button title="Delete" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(s)}><Trash2 size={14} /></button>
                      </>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <StaffModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function StaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'purchasing' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !f.email.trim() || !f.password) { toast.error('Name, email and password are required'); return; }
    if (f.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      await fetchApi('/staff', { method: 'POST', body: JSON.stringify(f) });
      toast.success('Staff account created');
      onSaved();
    } catch (e: any) { toast.error('Create failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Staff Account" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create'}</PrimaryBtn></>}>
      <Field label="Full name *"><TextInput value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Email *"><TextInput type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
      <Field label="Temporary password *"><TextInput type="text" value={f.password} onChange={e => set('password', e.target.value)} placeholder="At least 6 characters" /></Field>
      <Field label="Role *"><Select value={f.role} onChange={v => set('role', v)} options={ROLES} placeholder="Select role" /></Field>
      <p style={{ fontSize: '12px', color: '#8a8a8a' }}>
        <strong>Bookkeeper</strong>: money view (dashboard, orders, expenses, clients). <strong>Purchasing</strong>: supply view (suppliers, POs, quotations, product lines, inventory). <strong>Office Admin</strong>: combined bookkeeper + purchasing access (for one person doing both jobs). <strong>Admin</strong>: full access.
      </p>
    </Modal>
  );
}
