import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Power } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, PrimaryBtn, GhostBtn, badge } from './crmKit';

// Employee accounts are created by the admin (no self-registration). These accounts
// log into the /production portal. Raw employee_accounts rows are snake_case.
interface Employee {
  id: number;
  full_name: string;
  email: string;
  department?: string;
  position?: string;
  phone?: string;
  status?: string; // 'approved' | 'deactivated' | (legacy 'pending'/'rejected')
  created_at?: string;
}

const statusBadge = (s?: string) => {
  if (s === 'deactivated') return badge('Deactivated', '#991b1b', '#fee2e2');
  if (s === 'pending') return badge('Pending', '#92400e', '#fef3c7');
  if (s === 'rejected') return badge('Rejected', '#991b1b', '#fee2e2');
  return badge('Active', '#065f46', '#d1fae5');
};
const isActive = (s?: string) => s !== 'deactivated' && s !== 'rejected';

export function EmployeeAccountsList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Employee[]>('/admin/employees')); }
    catch { toast.error('Failed to load employee accounts'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q);
  });

  const toggleActive = async (e: Employee) => {
    const next = isActive(e.status) ? 'deactivated' : 'approved';
    const prev = rows; setRows(rows.map(x => x.id === e.id ? { ...x, status: next } : x));
    try {
      await fetchApi(`/admin/employees/${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast.success(next === 'deactivated' ? 'Account deactivated' : 'Account reactivated');
    } catch { setRows(prev); toast.error('Update failed'); }
  };

  const onDelete = async (e: Employee) => {
    if (!(await confirmDialog({ title: `Permanently delete "${e.full_name}"?`, message: 'This removes the account for good. Their past request history is kept but no longer linked.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(x => x.id !== e.id));
    try {
      await fetchApi(`/admin/employees/${e.id}`, { method: 'DELETE' });
      toast.success('Employee account deleted');
    } catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Production Accounts</h1><p style={S.sub}>Create logins for production staff. They use these to sign into the Production portal (<strong>/production</strong>) to file purchase requests.</p></div>
        {isAdmin && <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />New Employee</button>}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <TextInput placeholder="Search name, email, department…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '360px' }} />
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Email</th><th style={S.th}>Department</th><th style={S.th}>Position</th><th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={6}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={6}>No employee accounts yet.</td></tr>
              : filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{e.full_name}</td>
                  <td style={S.td}>{e.email}</td>
                  <td style={S.td}>{e.department || '—'}</td>
                  <td style={S.td}>{e.position || '—'}</td>
                  <td style={S.td}>{statusBadge(e.status)}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    {isAdmin ? <>
                      <button title="Edit" style={S.rowBtn} onClick={() => { setEditing(e); setShowModal(true); }}><Pencil size={13} /></button>
                      <button title={isActive(e.status) ? 'Deactivate' : 'Reactivate'} style={{ ...S.rowBtn, color: isActive(e.status) ? '#b91c1c' : '#7a6a0c' }} onClick={() => toggleActive(e)}><Power size={13} /></button>
                      <button title="Delete" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(e)}><Trash2 size={14} /></button>
                    </> : <span style={{ color: '#8a8a8a', fontSize: '12px' }}>—</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <EmployeeModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function EmployeeModal({ initial, onClose, onSaved }: { initial: Employee | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    full_name: initial?.full_name || '', email: initial?.email || '', password: '',
    department: initial?.department || '', position: initial?.position || '', phone: initial?.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.full_name.trim() || !f.email.trim()) { toast.error('Name and email are required'); return; }
    if (!initial && !f.password) { toast.error('Set a password for the new account'); return; }
    if (f.password && f.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      if (initial) {
        const body: any = { full_name: f.full_name, email: f.email, department: f.department, position: f.position, phone: f.phone };
        if (f.password) body.password = f.password;
        await fetchApi(`/admin/employees/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('Employee updated');
      } else {
        await fetchApi('/admin/employees', { method: 'POST', body: JSON.stringify(f) });
        toast.success('Employee account created');
      }
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Employee' : 'New Employee Account'} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</PrimaryBtn></>}>
      <Field label="Full name *"><TextInput value={f.full_name} onChange={e => set('full_name', e.target.value)} /></Field>
      <Field label="Email *"><TextInput type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
      <Field label={initial ? 'Reset password (optional)' : 'Password *'}>
        <TextInput type="text" value={f.password} onChange={e => set('password', e.target.value)} placeholder={initial ? 'Leave blank to keep current' : 'At least 6 characters'} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Department"><TextInput value={f.department} onChange={e => set('department', e.target.value)} /></Field>
        <Field label="Position"><TextInput value={f.position} onChange={e => set('position', e.target.value)} /></Field>
      </div>
      <Field label="Phone"><TextInput value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
      <p style={{ fontSize: '12px', color: '#8a8a8a' }}>The employee signs into the Production portal (<strong>/production</strong>) with this email and password. Share the credentials with them; they can be reset here anytime.</p>
    </Modal>
  );
}
