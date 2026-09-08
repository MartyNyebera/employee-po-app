import { useEffect, useState, type ReactNode } from 'react';
import { Search, Trash2, Pencil, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, TextArea, PrimaryBtn, GhostBtn, pill, peso } from './crmKit';

interface Project {
  id: string; name: string; description?: string; status?: string;
  client?: string; location?: string; startDate?: string; endDate?: string;
  budgetAllocation?: number; completedAt?: string | null; completedBy?: string | null;
}

// 'Completed' is a SOFT ARCHIVE, deliberately absent from the edit modal: the only way in is the
// admin-only "Mark as Complete" button, which is what keeps the action admin-gated (the generic
// PATCH also admits accounting) and guarantees completed_by/completed_at are stamped.
const EDITABLE_STATUSES = ['Active', 'On Hold'];
// If a project is somehow already Completed, keep its own value in the dropdown so editing another
// field can't silently reset an archived project back to Active.
const statusOptionsFor = (current?: string) =>
  current && !EDITABLE_STATUSES.includes(current) ? [...EDITABLE_STATUSES, current] : EDITABLE_STATUSES;
const statusBadge = (s?: string) =>
  s === 'Active' ? pill('Active', 'good')
  : s === 'On Hold' ? pill('On Hold', 'pending')
  : s === 'Completed' ? pill('Completed', 'good')
  : <span style={{ color: '#8a8a8a' }}>—</span>;

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '—');
const fmtStamp = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
      border: '1px solid ' + (active ? '#000000' : '#e0e0e0'),
      background: active ? '#000000' : '#ffffff', color: active ? '#ffffff' : '#5a5a5a',
      borderRadius: '8px',
    }}>{children}</button>
  );
}

export function ProjectsList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [busyId, setBusyId] = useState('');

  // Loads EVERYTHING (no ?active=1) — this screen is where the archive is managed, so it needs
  // both sides. Only the new-request pickers ask the server to drop completed projects.
  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Project[]>('/projects')); }
    catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const isDone = (p: Project) => p.status === 'Completed';
  const inTab = rows.filter(p => (tab === 'history' ? isDone(p) : !isDone(p)));
  const doneCount = rows.filter(isDone).length;

  const filtered = inTab.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.name.toLowerCase().includes(q) || (r.client || '').toLowerCase().includes(q);
    // Every history row is 'Completed', so the status filter only means something on the Active tab.
    const matchS = tab === 'history' || !statusFilter || r.status === statusFilter;
    return matchQ && matchS;
  });

  const onDelete = async (p: Project) => {
    if (!(await confirmDialog({ title: `Delete project "${p.name}"?`, message: 'This cannot be undone, and purchase requests charged to it will fall back to "Personal use". To retire a finished project without losing anything, use Mark as Complete instead.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(r => r.id !== p.id));
    try { await fetchApi(`/projects/${p.id}`, { method: 'DELETE' }); toast.success('Project deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  // SOFT ARCHIVE. Nothing is deleted and no link is broken — the row keeps its id, so every
  // purchase request and purchase order already charged to it still resolves its name and prints
  // exactly as before. All this changes is whether it is offered on a NEW request.
  const onComplete = async (p: Project) => {
    if (!(await confirmDialog({
      title: `Mark "${p.name}" as complete?`,
      message: 'It stops appearing in the purchase-request project picker and moves to Project History. Nothing is deleted — existing purchase requests and orders are unaffected and stay visible. You can reactivate it any time.',
      confirmLabel: 'Mark complete',
    }))) return;
    setBusyId(p.id);
    try {
      const updated = await fetchApi<Project>(`/projects/${p.id}/complete`, { method: 'POST', body: JSON.stringify({}) });
      setRows(rs => rs.map(r => r.id === p.id ? { ...r, ...updated } : r));
      toast.success(`${p.name} marked complete`);
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(''); }
  };

  const onReactivate = async (p: Project) => {
    if (!(await confirmDialog({
      title: `Reactivate "${p.name}"?`,
      message: 'It goes back to Active and reappears in the purchase-request project picker.',
      confirmLabel: 'Reactivate',
    }))) return;
    setBusyId(p.id);
    try {
      const updated = await fetchApi<Project>(`/projects/${p.id}/reactivate`, { method: 'POST', body: JSON.stringify({}) });
      setRows(rs => rs.map(r => r.id === p.id ? { ...r, ...updated } : r));
      toast.success(`${p.name} reactivated`);
    } catch (e: any) { toast.error('Failed: ' + e.message); } finally { setBusyId(''); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={S.h1}>Projects</h1>
          <p style={S.sub}>{tab === 'active'
            ? 'Jobs and sites employees can charge purchase requests to.'
            : 'Completed projects. Read-only and kept in full — every purchase request and order charged to them still works.'}</p>
        </div>
        {/* Admin cannot add projects from the admin portal (#10). */}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <TabBtn active={tab === 'active'} onClick={() => setTab('active')}>Active Projects</TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>Project History{doneCount ? ` (${doneCount})` : ''}</TabBtn>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8a8a8a' }} />
          <TextInput placeholder="Search name or client…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '34px' }} />
        </div>
        {tab === 'active' && (
          <div style={{ minWidth: '160px' }}>
            <Select value={statusFilter} onChange={setStatusFilter} options={EDITABLE_STATUSES} placeholder="All statuses" />
          </div>
        )}
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Project</th><th style={S.th}>Client</th>
            <th style={S.th}>{tab === 'history' ? 'Completed' : 'Status'}</th>
            <th style={S.th}>Timeline</th><th style={{ ...S.th, textAlign: 'right' }}>Budget</th>
            {isAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={6}>Loading…</td></tr>
              : filtered.length === 0 ? (
                <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={6}>
                  {tab === 'history' ? 'No completed projects yet.' : 'No projects yet.'}
                </td></tr>
              )
              : filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>
                    {p.name}
                    {p.location ? <div style={{ fontSize: '12px', fontWeight: 400, color: '#8a8a8a' }}>{p.location}</div> : null}
                  </td>
                  <td style={S.td}>{p.client || '—'}</td>
                  <td style={S.td}>
                    {tab === 'history' ? (
                      <>
                        <div style={{ color: '#000000' }}>{fmtStamp(p.completedAt)}</div>
                        <div style={{ fontSize: '12px', color: '#8a8a8a' }}>by {p.completedBy || '—'}</div>
                      </>
                    ) : statusBadge(p.status)}
                  </td>
                  <td style={S.td}>{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#000000' }}>{peso(p.budgetAllocation)}</td>
                  {isAdmin && (
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {tab === 'history' ? (
                        // Read-only apart from the undo: no Edit, no Delete on an archived project.
                        <button title="Reactivate" style={{ ...S.rowBtn, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          disabled={busyId === p.id} onClick={() => onReactivate(p)}>
                          <RotateCcw size={13} /> Reactivate
                        </button>
                      ) : (
                        <>
                          <button title="Mark as Complete" style={{ ...S.rowBtn, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            disabled={busyId === p.id} onClick={() => onComplete(p)}>
                            <CheckCircle2 size={13} /> Mark as Complete
                          </button>
                          <button title="Edit" style={S.rowBtn} onClick={() => { setEditing(p); setShowModal(true); }}><Pencil size={13} /></button>
                          <button title="Delete" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(p)}><Trash2 size={14} /></button>
                        </>
                      )}
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
        <Field label="Status"><Select value={f.status || 'Active'} onChange={v => set('status', v)} options={statusOptionsFor(f.status)} /></Field>
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
