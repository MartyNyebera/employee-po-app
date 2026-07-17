import { useEffect, useState } from 'react';
import { Plus, Search, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, TextArea, PrimaryBtn, GhostBtn, badge, peso } from './crmKit';

interface Project {
  id: string; name: string; description?: string; status?: string;
  client?: string; location?: string; startDate?: string; endDate?: string;
  budgetAllocation?: number;
}

const STATUSES = ['Active', 'On Hold', 'Completed'];
const statusBadge = (s?: string) =>
  s === 'Active' ? badge('Active', '#065f46', '#d1fae5')
  : s === 'On Hold' ? badge('On Hold', '#92400e', '#fef3c7')
  : s === 'Completed' ? badge('Completed', '#7a6a0c', '#ececec')
  : <span style={{ color: '#8a8a8a' }}>—</span>;

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '—');

export function ProjectsList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Project[]>('/projects')); }
    catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.name.toLowerCase().includes(q) || (r.client || '').toLowerCase().includes(q);
    const matchS = !statusFilter || r.status === statusFilter;
    return matchQ && matchS;
  });

  const onDelete = async (p: Project) => {
    if (!(await confirmDialog({ title: `Delete project "${p.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(r => r.id !== p.id));
    try { await fetchApi(`/projects/${p.id}`, { method: 'DELETE' }); toast.success('Project deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Projects</h1><p style={S.sub}>Jobs and sites employees can charge purchase requests to.</p></div>
        {/* Admin cannot add projects from the admin portal (#10). */}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8a8a8a' }} />
          <TextInput placeholder="Search name or client…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '34px' }} />
        </div>
        <div style={{ minWidth: '160px' }}>
          <Select value={statusFilter} onChange={setStatusFilter} options={STATUSES} placeholder="All statuses" />
        </div>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Project</th><th style={S.th}>Client</th><th style={S.th}>Status</th>
            <th style={S.th}>Timeline</th><th style={{ ...S.th, textAlign: 'right' }}>Budget</th>
            {isAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={6}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={6}>No projects yet.</td></tr>
              : filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>
                    {p.name}
                    {p.location ? <div style={{ fontSize: '12px', fontWeight: 400, color: '#8a8a8a' }}>{p.location}</div> : null}
                  </td>
                  <td style={S.td}>{p.client || '—'}</td>
                  <td style={S.td}>{statusBadge(p.status)}</td>
                  <td style={S.td}>{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#000000' }}>{peso(p.budgetAllocation)}</td>
                  {isAdmin && (
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <button title="Edit" style={S.rowBtn} onClick={() => { setEditing(p); setShowModal(true); }}><Pencil size={13} /></button>
                      <button title="Delete" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(p)}><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <ProjectModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function ProjectModal({ initial, onClose, onSaved }: { initial: Project | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Project>(initial || { id: '', name: '', status: 'Active', budgetAllocation: 0 });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Project, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name || !f.name.trim()) { toast.error('Project name is required'); return; }
    setSaving(true);
    try {
      const body = {
        name: f.name, description: f.description, status: f.status || 'Active', client: f.client,
        location: f.location, startDate: f.startDate, endDate: f.endDate,
        budgetAllocation: Number(f.budgetAllocation) || 0,
      };
      if (initial) await fetchApi(`/projects/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await fetchApi('/projects', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Project updated' : 'Project created');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Project' : 'New Project'} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</PrimaryBtn></>}>
      <Field label="Project name *"><TextInput value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Description"><TextArea value={f.description || ''} onChange={e => set('description', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Status"><Select value={f.status || 'Active'} onChange={v => set('status', v)} options={STATUSES} /></Field>
        <Field label="Budget allocation (₱)"><TextInput type="number" min="0" step="0.01" value={String(f.budgetAllocation ?? 0)} onChange={e => set('budgetAllocation', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Client / owner"><TextInput value={f.client || ''} onChange={e => set('client', e.target.value)} /></Field>
        <Field label="Location"><TextInput value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Start date"><TextInput type="date" value={f.startDate ? String(f.startDate).slice(0, 10) : ''} onChange={e => set('startDate', e.target.value)} /></Field>
        <Field label="End date"><TextInput type="date" value={f.endDate ? String(f.endDate).slice(0, 10) : ''} onChange={e => set('endDate', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
