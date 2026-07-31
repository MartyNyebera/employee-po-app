import { useEffect, useState } from 'react';
import { Plus, Trash2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { S, Modal, Field, TextInput, PrimaryBtn, GhostBtn } from './crmKit';

interface Station {
  id: number;
  name: string | null;
  station_token: string;
  punch_count?: number;
  created_at?: string;
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '—');

export function StationsList() {
  const [rows, setRows] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Station[]>('/attendance/stations')); }
    catch { toast.error('Failed to load time stations'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const copyToken = async (s: Station) => {
    try { await navigator.clipboard.writeText(s.station_token); setCopied(s.id); setTimeout(() => setCopied(null), 1500); toast.success('Station token copied'); }
    catch { toast.error('Could not copy — select and copy it manually'); }
  };

  const onDelete = async (s: Station) => {
    if (!(await confirmDialog({ title: `Delete station "${s.name || 'Unnamed'}"?`, message: 'Any kiosk using this token stops working. Punch history is kept.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const prev = rows; setRows(rows.filter(x => x.id !== s.id));
    try { await fetchApi(`/attendance/stations/${s.id}`, { method: 'DELETE' }); toast.success('Station deleted'); }
    catch { setRows(prev); toast.error('Delete failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Time Stations</h1><p style={S.sub}>Each door PC is a station. Open <strong>/clock</strong> on it and paste the station token once to set it up.</p></div>
        <button style={S.addBtn} onClick={() => setShowModal(true)}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Station</button>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Station Token</th><th style={S.th}>Punches</th>
            <th style={S.th}>Created</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={5}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={5}>No stations yet.</td></tr>
              : rows.map(s => (
                <tr key={s.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{s.name || <span style={{ color: '#8a8a8a', fontWeight: 400 }}>Unnamed</span>}</td>
                  <td style={S.td}>
                    <code style={{ fontSize: '12px', color: '#5a5a5a' }}>{s.station_token}</code>
                    <button title="Copy token" style={{ ...S.rowBtn, padding: '4px 8px' }} onClick={() => copyToken(s)}>{copied === s.id ? <Check size={13} /> : <Copy size={13} />}</button>
                  </td>
                  <td style={S.td}>{s.punch_count ?? 0}</td>
                  <td style={S.td}>{fmtDate(s.created_at)}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button title="Delete" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => onDelete(s)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <StationModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function StationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetchApi('/attendance/stations', { method: 'POST', body: JSON.stringify({ name: name.trim() || null }) });
      toast.success('Station created — copy its token onto the kiosk');
      onSaved();
    } catch (e: any) { toast.error('Create failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Time Station" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create'}</PrimaryBtn></>}>
      <Field label="Station name (e.g. Main Gate)"><TextInput value={name} onChange={e => setName(e.target.value)} /></Field>
      <p style={{ fontSize: '12px', color: '#8a8a8a' }}>A unique station token is generated on create. Open <strong>/clock</strong> on the door PC and paste the token once — it's saved on that PC.</p>
    </Modal>
  );
}
