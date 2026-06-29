import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, TextArea, PrimaryBtn, GhostBtn } from './crmKit';

interface WorkRow { id: string; phase?: string; scope: string; responsible?: string; startWeek?: number | null; durationWeeks?: number | null; status?: string; sortOrder?: number | null; notes?: string; }

const STATUSES = ['Not started', 'In progress', 'Done'];
const statusColor = (s?: string) => s === 'Done' ? '#059669' : s === 'In progress' ? '#2563eb' : '#9ca3af';
const statusBg = (s?: string) => s === 'Done' ? '#d1fae5' : s === 'In progress' ? '#dbeafe' : '#e5e7eb';

export function WorkScheduleList({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<WorkRow[]>('/work-schedule')); }
    catch { toast.error('Failed to load work schedule'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const maxWeek = Math.max(12, ...rows.map(r => (Number(r.startWeek) || 0) + (Number(r.durationWeeks) || 0) - 1));
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  const phases = Array.from(new Set(rows.map(r => r.phase || 'Unphased')));

  const patch = async (r: WorkRow, changes: Partial<WorkRow>) => {
    const prev = rows;
    setRows(rows.map(x => x.id === r.id ? { ...x, ...changes } : x));
    try { await fetchApi(`/work-schedule/${r.id}`, { method: 'PATCH', body: JSON.stringify(changes) }); }
    catch { setRows(prev); toast.error('Update failed'); }
  };

  const onDelete = async (r: WorkRow) => {
    if (!window.confirm(`Delete "${r.scope}"?`)) return;
    const prev = rows; setRows(rows.filter(x => x.id !== r.id));
    try { await fetchApi(`/work-schedule/${r.id}`, { method: 'DELETE' }); toast.success('Row deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Work Schedule</h1><p style={S.sub}>Scope of works across weeks — who's responsible and where each task sits.</p></div>
        {isAdmin && <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Add Scope</button>}
      </div>

      <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', fontSize: '12px', color: '#6b7280' }}>
        {STATUSES.map(s => <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: statusBg(s), border: `1px solid ${statusColor(s)}` }} />{s}</span>)}
      </div>

      {loading ? <div style={{ color: '#6b7280' }}>Loading…</div>
        : rows.length === 0 ? <div style={S.card}><div style={{ ...S.td, color: '#9ca3af', borderBottom: 'none' }}>No scopes yet.</div></div>
        : <div style={{ ...S.card, overflowX: 'auto' }}>
            <table style={{ ...S.table, minWidth: `${520 + maxWeek * 34}px` }}>
              <thead>
                <tr>
                  <th style={{ ...S.th, position: 'sticky', left: 0, background: '#f9fafb', minWidth: '240px' }}>Scope</th>
                  <th style={S.th}>Who</th><th style={{ ...S.th, textAlign: 'center' }}>Start</th><th style={{ ...S.th, textAlign: 'center' }}>Dur</th><th style={S.th}>Status</th>
                  {weeks.map(w => <th key={w} style={{ ...S.th, textAlign: 'center', padding: '14px 0', width: '34px' }}>{w}</th>)}
                  {isAdmin && <th style={S.th}></th>}
                </tr>
              </thead>
              <tbody>
                {phases.map(phase => (
                  <>
                    <tr key={'ph-' + phase}><td colSpan={5 + weeks.length + (isAdmin ? 1 : 0)} style={{ padding: '10px 16px', background: '#f3f4f6', fontWeight: 700, fontSize: '12px', color: '#374151', position: 'sticky', left: 0 }}>{phase}</td></tr>
                    {rows.filter(r => (r.phase || 'Unphased') === phase).map(r => {
                      const start = Number(r.startWeek) || 0; const dur = Number(r.durationWeeks) || 0;
                      return (
                        <tr key={r.id}>
                          <td style={{ ...S.td, fontWeight: 600, color: '#111827', position: 'sticky', left: 0, background: '#fff', minWidth: '240px' }}>{r.scope}</td>
                          <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{r.responsible || '—'}</td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            {isAdmin
                              ? <input type="number" value={r.startWeek ?? ''} onChange={e => patch(r, { startWeek: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...S.input, width: '52px', padding: '6px', textAlign: 'center' }} />
                              : (r.startWeek ?? '—')}
                          </td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            {isAdmin
                              ? <input type="number" value={r.durationWeeks ?? ''} onChange={e => patch(r, { durationWeeks: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...S.input, width: '52px', padding: '6px', textAlign: 'center' }} />
                              : (r.durationWeeks ?? '—')}
                          </td>
                          <td style={S.td}>
                            {isAdmin
                              ? <select value={r.status || 'Not started'} onChange={e => patch(r, { status: e.target.value })} style={{ ...S.input, width: 'auto', padding: '6px 8px', cursor: 'pointer' }}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                              : <span style={{ color: statusColor(r.status) }}>{r.status}</span>}
                          </td>
                          {weeks.map(w => {
                            const on = start > 0 && dur > 0 && w >= start && w <= start + dur - 1;
                            return <td key={w} style={{ padding: '4px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                              <div title={on ? `Week ${w}` : ''} style={{ height: '18px', borderRadius: '3px', background: on ? statusBg(r.status) : 'transparent', border: on ? `1px solid ${statusColor(r.status)}` : '1px solid transparent' }} />
                            </td>;
                          })}
                          {isAdmin && <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                            <button style={S.rowBtn} onClick={() => { setEditing(r); setShowModal(true); }}>Edit</button>
                            <button style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(r)}>Del</button>
                          </td>}
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>}

      {showModal && <WorkModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function WorkModal({ initial, onClose, onSaved }: { initial: WorkRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<WorkRow>(initial || { id: '', scope: '', status: 'Not started' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof WorkRow, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.scope?.trim()) { toast.error('Scope is required'); return; }
    setSaving(true);
    try {
      const body = { ...f, startWeek: f.startWeek === ('' as any) ? null : f.startWeek, durationWeeks: f.durationWeeks === ('' as any) ? null : f.durationWeeks, sortOrder: f.sortOrder === ('' as any) ? null : f.sortOrder };
      if (initial) await fetchApi(`/work-schedule/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await fetchApi('/work-schedule', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Scope updated' : 'Scope added');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Scope' : 'Add Scope'} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryBtn></>}>
      <Field label="Phase"><TextInput value={f.phase || ''} onChange={e => set('phase', e.target.value)} placeholder="e.g. PHASE 1 — Set up & start trading" /></Field>
      <Field label="Scope *"><TextInput value={f.scope || ''} onChange={e => set('scope', e.target.value)} /></Field>
      <Field label="Responsible"><TextInput value={f.responsible || ''} onChange={e => set('responsible', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field label="Start week"><TextInput type="number" value={f.startWeek ?? ''} onChange={e => set('startWeek', e.target.value)} /></Field>
        <Field label="Duration (weeks)"><TextInput type="number" value={f.durationWeeks ?? ''} onChange={e => set('durationWeeks', e.target.value)} /></Field>
        <Field label="Sort order"><TextInput type="number" value={f.sortOrder ?? ''} onChange={e => set('sortOrder', e.target.value)} /></Field>
      </div>
      <Field label="Status"><Select value={f.status || ''} onChange={v => set('status', v)} options={STATUSES} /></Field>
      <Field label="Notes"><TextArea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}
