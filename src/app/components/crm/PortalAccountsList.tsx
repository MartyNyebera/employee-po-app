import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Power } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, PrimaryBtn, GhostBtn, badge } from './crmKit';

// One list for every portal account type (purchasing / warehouse / accounting / sales /
// logistics). These shipped as five near-identical files; they differ only in the API path
// and the wording, and the server now serves them all from one mounted route factory too.
//
// Not covered here: Employee accounts (extra department/position fields) and Staff accounts
// (role assignment) — those keep their own components.
export interface PortalAccount {
  id: number;
  full_name: string;
  email: string;
  phone?: string;
  status?: string; // 'approved' | 'deactivated'
  has_signature?: boolean;
  created_at?: string;
}

interface Props {
  isAdmin: boolean;
  /** API segment: /admin/<path> */
  path: string;
  /** e.g. "Purchasing" — used for headings, buttons and messages. */
  label: string;
  /** The portal route these accounts sign into, e.g. "/purchasing". */
  portalPath: string;
  /** One line describing what the role does, shown under the heading. */
  blurb: string;
}

const statusBadge = (s?: string) =>
  s === 'deactivated' ? badge('Deactivated', '#991b1b', '#fee2e2') : badge('Active', '#065f46', '#d1fae5');
const isActive = (s?: string) => s !== 'deactivated';

export function PortalAccountsList({ isAdmin, path, label, portalPath, blurb }: Props) {
  const [rows, setRows] = useState<PortalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PortalAccount | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<PortalAccount[]>(`/admin/${path}`)); }
    catch { toast.error(`Failed to load ${label.toLowerCase()} accounts`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [path]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  // Optimistic with rollback: the list stays responsive, and a failed write puts the old
  // rows back rather than leaving the UI lying about the server's state.
  const toggleActive = async (e: PortalAccount) => {
    const next = isActive(e.status) ? 'deactivated' : 'approved';
    const prev = rows; setRows(rows.map(x => x.id === e.id ? { ...x, status: next } : x));
    try {
      await fetchApi(`/admin/${path}/${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast.success(next === 'deactivated' ? 'Account deactivated' : 'Account reactivated');
    } catch { setRows(prev); toast.error('Update failed'); }
  };

  const onDelete = async (e: PortalAccount) => {
    if (!(await confirmDialog({ title: `Permanently delete ${label.toLowerCase()} account "${e.full_name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(x => x.id !== e.id));
    try {
      await fetchApi(`/admin/${path}/${e.id}`, { method: 'DELETE' });
      toast.success(`${label} account deleted`);
    } catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>{label} Accounts</h1>
          <p style={S.sub}>Create logins for {label}. They sign into the {label} portal (<strong>{portalPath}</strong>) {blurb}</p>
        </div>
        {isAdmin && <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Account</button>}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <TextInput placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '360px' }} />
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Email</th><th style={S.th}>Phone</th><th style={S.th}>Signature</th><th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={6}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={6}>No {label.toLowerCase()} accounts yet.</td></tr>
              : filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{e.full_name}</td>
                  <td style={S.td}>{e.email}</td>
                  <td style={S.td}>{e.phone || '—'}</td>
                  <td style={S.td}>{e.has_signature ? badge('On file', '#065f46', '#d1fae5') : badge('Not set', '#92400e', '#fef3c7')}</td>
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

      {showModal && (
        <PortalAccountModal initial={editing} path={path} label={label} portalPath={portalPath}
          onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

function PortalAccountModal({ initial, path, label, portalPath, onClose, onSaved }: {
  initial: PortalAccount | null; path: string; label: string; portalPath: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    full_name: initial?.full_name || '', email: initial?.email || '', password: '', phone: initial?.phone || '',
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
        const body: any = { full_name: f.full_name, email: f.email, phone: f.phone };
        if (f.password) body.password = f.password;
        await fetchApi(`/admin/${path}/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success(`${label} account updated`);
      } else {
        await fetchApi(`/admin/${path}`, { method: 'POST', body: JSON.stringify(f) });
        toast.success(`${label} account created`);
      }
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? `Edit ${label} Account` : `New ${label} Account`} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</PrimaryBtn></>}>
      <Field label="Full name *"><TextInput value={f.full_name} onChange={e => set('full_name', e.target.value)} /></Field>
      <Field label="Email *"><TextInput type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
      <Field label={initial ? 'Reset password (optional)' : 'Password *'}>
        {/* type="text" by design: the admin sets the password and reads it out to the user. */}
        <TextInput type="text" value={f.password} onChange={e => set('password', e.target.value)} placeholder={initial ? 'Leave blank to keep current' : 'At least 6 characters'} />
      </Field>
      <Field label="Phone"><TextInput value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
      <p style={{ fontSize: '12px', color: '#8a8a8a' }}>This account signs into the {label} portal (<strong>{portalPath}</strong>) with this email and password. They set their own e-signature inside the portal.</p>
    </Modal>
  );
}
