import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, QrCode, RefreshCw, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { printQrCard, printQrCards } from '../../lib/qrCard';
import { S, Modal, Field, TextInput, Select, PrimaryBtn, GhostBtn, pill, peso } from './crmKit';

// Server returns snake_case straight from the `persons` table.
interface Person {
  id: number;
  full_name: string;
  department?: string | null;
  position?: string | null;
  employment_type?: 'daily' | 'monthly' | null;
  status: 'active' | 'resigned';
  hired_on?: string | null;
  last_day?: string | null;
  qr_token: string;
  // Admin-input pay. Meaning follows employment_type (daily rate vs monthly salary). Postgres
  // NUMERIC comes back as a string, so allow both. Admin/roster-only — never on the attendance sheet.
  pay_rate?: number | string | null;
  created_at?: string;
}

const STATUSES = ['active', 'resigned'];
const TYPES = ['daily', 'monthly'];
const statusBadge = (s: string) => s === 'resigned' ? pill('Resigned', 'bad') : pill('Active', 'good');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
const todayInput = () => new Date().toISOString().slice(0, 10);
// A person's pay follows their employment_type: daily rate vs monthly salary.
const payLabelFor = (t?: string | null) => t === 'daily' ? 'Daily rate' : t === 'monthly' ? 'Monthly salary' : 'Pay rate';
const paySuffixFor = (t?: string | null) => t === 'daily' ? '/day' : t === 'monthly' ? '/mo' : '';

export function RosterList() {
  const [rows, setRows] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchApi<Person[]>('/persons')); }
    catch { toast.error('Failed to load roster'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.full_name.toLowerCase().includes(q)
      || (r.department || '').toLowerCase().includes(q)
      || (r.position || '').toLowerCase().includes(q);
    const matchS = !statusFilter || r.status === statusFilter;
    return matchQ && matchS;
  });

  // Quick active <-> resigned flip. Resigning stamps last_day = today; reactivating clears it.
  const toggleStatus = async (p: Person) => {
    const resigning = p.status === 'active';
    if (resigning && !(await confirmDialog({ title: `Mark "${p.full_name}" as resigned?`, message: 'Their last day will be set to today. Attendance history is kept.', confirmLabel: 'Mark resigned', tone: 'danger' }))) return;
    const next = { status: resigning ? 'resigned' : 'active', last_day: resigning ? todayInput() : null };
    const prev = rows;
    setRows(rows.map(x => x.id === p.id ? { ...x, ...next } as Person : x));
    try { await fetchApi(`/persons/${p.id}`, { method: 'PATCH', body: JSON.stringify(next) }); toast.success(resigning ? 'Marked resigned' : 'Reactivated'); }
    catch { setRows(prev); toast.error('Update failed'); }
  };

  const onPrint = async (p: Person) => {
    try { await printQrCard(p); }
    catch (e: any) { toast.error(e.message || 'Could not print QR card'); }
  };

  // Batch-print every card currently shown (respects the search + status filter), tiled on A4.
  const onPrintAll = async () => {
    if (filtered.length === 0) { toast.error('No people to print'); return; }
    try { await printQrCards(filtered); }
    catch (e: any) { toast.error(e.message || 'Could not print QR cards'); }
  };

  const onReissue = async (p: Person) => {
    if (!(await confirmDialog({ title: `Reissue QR for "${p.full_name}"?`, message: 'The current card stops working immediately. Print a new one after.', confirmLabel: 'Reissue', tone: 'danger' }))) return;
    try {
      const updated = await fetchApi<{ id: number; qr_token: string }>(`/persons/${p.id}/reissue-qr`, { method: 'POST' });
      setRows(rows.map(x => x.id === p.id ? { ...x, qr_token: updated.qr_token } : x));
      toast.success('QR reissued — print the new card');
    } catch { toast.error('Reissue failed'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div><h1 style={S.h1}>Roster</h1><p style={S.sub}>Employees and their scannable QR ID cards for the time station.</p></div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button style={{ ...S.addBtn, background: '#fff', color: '#262626', border: '1px solid #d6d6d6' }} onClick={onPrintAll} title="Print all shown cards on A4">
            <Printer size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Print QR cards
          </button>
          <button style={S.addBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Person</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8a8a8a' }} />
          <TextInput placeholder="Search name, department or position…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '34px' }} />
        </div>
        <div style={{ minWidth: '160px' }}>
          <Select value={statusFilter} onChange={setStatusFilter} options={STATUSES} placeholder="All statuses" />
        </div>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Department / Position</th><th style={S.th}>Type</th>
            <th style={S.th}>Pay</th><th style={S.th}>Status</th><th style={S.th}>Hired</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={7}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={7}>No people yet.</td></tr>
              : filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{p.full_name}</td>
                  <td style={S.td}>{[p.department, p.position].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={S.td}>{p.employment_type ? p.employment_type.charAt(0).toUpperCase() + p.employment_type.slice(1) : '—'}</td>
                  <td style={S.td}>{p.pay_rate === null || p.pay_rate === undefined || p.pay_rate === '' ? '—' : <>{peso(Number(p.pay_rate))}<span style={{ color: '#8a8a8a', fontSize: '12px' }}>{paySuffixFor(p.employment_type)}</span></>}</td>
                  <td style={S.td}>
                    <button title={p.status === 'active' ? 'Mark resigned' : 'Reactivate'} onClick={() => toggleStatus(p)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{statusBadge(p.status)}</button>
                  </td>
                  <td style={S.td}>{fmtDate(p.hired_on)}{p.status === 'resigned' && p.last_day ? <div style={{ fontSize: '12px', color: '#8a8a8a' }}>Last: {fmtDate(p.last_day)}</div> : null}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button title="Print QR card" style={S.rowBtn} onClick={() => onPrint(p)}><QrCode size={14} /></button>
                    <button title="Reissue QR" style={S.rowBtn} onClick={() => onReissue(p)}><RefreshCw size={13} /></button>
                    <button title="Edit" style={S.rowBtn} onClick={() => { setEditing(p); setShowModal(true); }}><Pencil size={13} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && <PersonModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function PersonModal({ initial, onClose, onSaved }: { initial: Person | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    full_name: initial?.full_name || '',
    department: initial?.department || '',
    position: initial?.position || '',
    employment_type: initial?.employment_type || '',
    status: initial?.status || 'active',
    hired_on: initial?.hired_on ? String(initial.hired_on).slice(0, 10) : '',
    last_day: initial?.last_day ? String(initial.last_day).slice(0, 10) : '',
    pay_rate: initial?.pay_rate === null || initial?.pay_rate === undefined ? '' : String(initial.pay_rate),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.full_name.trim()) { toast.error('Full name is required'); return; }
    setSaving(true);
    try {
      const body = {
        full_name: f.full_name.trim(),
        department: f.department || null,
        position: f.position || null,
        employment_type: f.employment_type || null,
        status: f.status || 'active',
        hired_on: f.hired_on || null,
        last_day: f.last_day || null,
        pay_rate: f.pay_rate.trim() === '' ? null : Number(f.pay_rate),
      };
      if (initial) await fetchApi(`/persons/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await fetchApi('/persons', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Person updated' : 'Person added — print their QR card');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial ? 'Edit Person' : 'New Person'} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</PrimaryBtn></>}>
      <Field label="Full name *"><TextInput value={f.full_name} onChange={e => set('full_name', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Department"><TextInput value={f.department} onChange={e => set('department', e.target.value)} /></Field>
        <Field label="Position"><TextInput value={f.position} onChange={e => set('position', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Employment type"><Select value={f.employment_type} onChange={v => set('employment_type', v)} options={TYPES} placeholder="Select type" /></Field>
        <Field label="Status"><Select value={f.status} onChange={v => set('status', v)} options={STATUSES} /></Field>
      </div>
      <Field label={payLabelFor(f.employment_type)}>
        <TextInput type="number" min="0" step="0.01" inputMode="decimal" value={f.pay_rate}
          onChange={e => set('pay_rate', e.target.value)} placeholder="Leave blank if not set" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Hired on"><TextInput type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></Field>
        <Field label="Last day"><TextInput type="date" value={f.last_day} onChange={e => set('last_day', e.target.value)} /></Field>
      </div>
      {initial ? <p style={{ fontSize: '12px', color: '#8a8a8a' }}>QR token is fixed for this person. Lost card? Use <strong>Reissue QR</strong> in the row to mint a new one.</p> : null}
    </Modal>
  );
}
