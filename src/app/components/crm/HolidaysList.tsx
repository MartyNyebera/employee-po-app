import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, Select, PrimaryBtn, GhostBtn, pill } from './crmKit';

// ============================================================================
// Holidays (Phase 4a) — admin-only editable calendar of regular/special dates, including
// off-calendar ones. Stored for the Phase 4b payroll run to read; nothing computes pay here.
// ============================================================================

interface Holiday { id: number; holiday_date: string; name: string | null; type: 'regular' | 'special'; created_at?: string; }

const TYPES = ['regular', 'special'];
const typeBadge = (t: string) => t === 'special' ? pill('Special', 'pending') : pill('Regular', 'good');
// holiday_date is a plain 'YYYY-MM-DD' — parse at local midnight so it doesn't shift a day.
const fmtDate = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

export function HolidaysList() {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Holiday[]>('/holidays')); }
    catch { toast.error('Failed to load holidays'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onDelete = async (h: Holiday) => {
    if (!(await confirmDialog({ title: `Delete "${h.name || fmtDate(h.holiday_date)}"?`, message: 'This removes the holiday from the calendar.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows;
    setRows(rows.filter(x => x.id !== h.id));
    try { await fetchApi(`/holidays/${h.id}`, { method: 'DELETE' }); toast.success('Holiday deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Holidays</h1><p style={S.sub}>Regular and special non-working days, including off-calendar dates. Payroll reads these later.</p></div>
        <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Holiday</button>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Date</th><th style={S.th}>Name</th><th style={S.th}>Type</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={4}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={4}>No holidays yet.</td></tr>
              : rows.map(h => (
                <tr key={h.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000' }}>{fmtDate(h.holiday_date)}</td>
                  <td style={S.td}>{h.name || '—'}</td>
                  <td style={S.td}>{typeBadge(h.type)}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button title="Edit" style={S.rowBtn} onClick={() => { setEditing(h); setShowModal(true); }}><Pencil size={13} /></button>
                    <button title="Delete" style={S.rowBtn} onClick={() => onDelete(h)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <HolidayModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function HolidayModal({ initial, onClose, onSaved }: { initial: Holiday | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    holiday_date: initial?.holiday_date || '',
    name: initial?.name || '',
    type: initial?.type || 'regular',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.holiday_date)) { toast.error('Pick a date'); return; }
    setSaving(true);
    try {
      const body = { holiday_date: f.holiday_date, name: f.name || null, type: f.type };
      if (initial) await fetchApi(`/holidays/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await fetchApi('/holidays', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Holiday updated' : 'Holiday added');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Holiday' : 'New Holiday'} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</PrimaryBtn></>}>
      <Field label="Date *"><TextInput type="date" value={f.holiday_date} onChange={e => set('holiday_date', e.target.value)} /></Field>
      <Field label="Name"><TextInput value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Independence Day" /></Field>
      <Field label="Type"><Select value={f.type} onChange={v => set('type', v)} options={TYPES} /></Field>
    </Modal>
  );
}
