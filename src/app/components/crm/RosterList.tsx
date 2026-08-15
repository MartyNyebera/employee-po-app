import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, QrCode, RefreshCw, Printer, UserMinus, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { fetchApi } from '../../api/client';
import { printQrCard, printQrCards } from '../../lib/qrCard';
import { fileToSquareThumb } from '../../lib/imageThumb';
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
  // Small base64 image thumbnail (data URL) for attendance verification at the clock station.
  photo_url?: string | null;
  // Standing government deductions (employee share). Sensitive, admin-only — like pay_rate, never
  // shown on the attendance sheet. NUMERIC comes back as a string, so allow both.
  sss_ee?: number | string | null;
  philhealth_ee?: number | string | null;
  pagibig_ee?: number | string | null;
  // Phase 4a. ot_eligible: allowed OT at all. withholding: sensitive tax amount (like pay_rate).
  ot_eligible?: boolean;
  withholding?: number | string | null;
  // Auto-SSS (gross × 4.5%) applies only when enrolled; false → ₱0 SSS every period. Default true.
  sss_enrolled?: boolean;
  created_at?: string;
}

// Round avatar with an initials fallback so a missing photo never leaves a blank/broken image.
const initialsOf = (name: string) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

function Avatar({ src, name, size }: { src?: string | null; name: string; size: number }) {
  const common: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, border: '1px solid #d6d6d6', objectFit: 'cover' };
  if (src) return <img src={src} alt="" style={common} />;
  return (
    <span style={{ ...common, background: '#ececec', color: '#5a5a5a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.38), fontWeight: 700 }}>
      {initialsOf(name)}
    </span>
  );
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
  const [resigning, setResigning] = useState<Person | null>(null);

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

  // Reactivate a resigned person (undo an off-board): back to active, last_day cleared so they can
  // clock in and be paid again. Soft — no history is touched. Resigning is handled by ResignModal
  // (which lets the admin pick the last working day instead of forcing today).
  const reactivate = async (p: Person) => {
    if (!(await confirmDialog({ title: `Reactivate "${p.full_name}"?`, message: 'They return to Active and their last day is cleared, so they can clock in and be paid again. Nothing in their history changes.', confirmLabel: 'Reactivate' }))) return;
    const prev = rows;
    setRows(rows.map(x => x.id === p.id ? { ...x, status: 'active', last_day: null } as Person : x));
    try { await fetchApi(`/persons/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', last_day: null }) }); toast.success('Reactivated'); }
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
              : filtered.map(p => {
                const resigned = p.status === 'resigned';
                return (
                <tr key={p.id} style={resigned ? { background: '#fafafa' } : undefined}>
                  <td style={{ ...S.td, color: '#000000', opacity: resigned ? 0.55 : 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar src={p.photo_url} name={p.full_name} size={30} />
                      <span style={{ fontWeight: 600 }}>{p.full_name}</span>
                    </span>
                  </td>
                  <td style={{ ...S.td, opacity: resigned ? 0.55 : 1 }}>{[p.department, p.position].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={{ ...S.td, opacity: resigned ? 0.55 : 1 }}>{p.employment_type ? p.employment_type.charAt(0).toUpperCase() + p.employment_type.slice(1) : '—'}</td>
                  <td style={{ ...S.td, opacity: resigned ? 0.55 : 1 }}>{p.pay_rate === null || p.pay_rate === undefined || p.pay_rate === '' ? '—' : <>{peso(Number(p.pay_rate))}<span style={{ color: '#8a8a8a', fontSize: '12px' }}>{paySuffixFor(p.employment_type)}</span></>}</td>
                  <td style={S.td}>{statusBadge(p.status)}</td>
                  <td style={{ ...S.td, opacity: resigned ? 0.55 : 1 }}>{fmtDate(p.hired_on)}{resigned && p.last_day ? <div style={{ fontSize: '12px', color: '#b45309' }}>Last day: {fmtDate(p.last_day)}</div> : null}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {resigned
                      ? <button title="Reactivate (undo resign)" style={{ ...S.rowBtn, color: '#166534' }} onClick={() => reactivate(p)}><UserCheck size={14} /></button>
                      : <button title="Resign / Terminate" style={{ ...S.rowBtn, color: '#b91c1c' }} onClick={() => setResigning(p)}><UserMinus size={14} /></button>}
                    <button title="Print QR card" style={S.rowBtn} onClick={() => onPrint(p)}><QrCode size={14} /></button>
                    <button title="Reissue QR" style={S.rowBtn} onClick={() => onReissue(p)}><RefreshCw size={13} /></button>
                    <button title="Edit" style={S.rowBtn} onClick={() => { setEditing(p); setShowModal(true); }}><Pencil size={13} /></button>
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {showModal && <PersonModal initial={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      {resigning && <ResignModal person={resigning} onClose={() => setResigning(null)} onDone={() => { setResigning(null); load(); }} />}
    </div>
  );
}

// Off-board an active employee. Soft only: sets status='resigned' + a chosen last working day, and
// preserves ALL history (attendance, past payslips). The date is editable — default today, but the
// admin can set a future or past last day. After that day the person drops out of payroll (H1) and
// can no longer clock in; their final period still computes. Reversible via Reactivate.
function ResignModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const [lastDay, setLastDay] = useState(person.last_day ? String(person.last_day).slice(0, 10) : todayInput());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!lastDay) { toast.error('Pick a last working day'); return; }
    setSaving(true);
    try {
      await fetchApi(`/persons/${person.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resigned', last_day: lastDay }) });
      toast.success('Marked resigned');
      onDone();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Resign / Terminate — ${person.full_name}`} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Mark resigned'}</PrimaryBtn></>}>
      <p style={{ fontSize: '13px', color: '#5a5a5a', marginTop: 0 }}>
        Soft off-board — <strong>all history is kept</strong> (attendance and past payslips are never deleted). From the last working day onward the person drops out of payroll and can no longer clock in, but their final period still computes normally. This can be undone with <strong>Reactivate</strong>.
      </p>
      <Field label="Last working day *">
        <TextInput type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} />
      </Field>
      <p style={{ fontSize: '12px', color: '#8a8a8a', marginTop: '4px' }}>
        Defaults to today — set a future date if you already know it, or a past date for a back-dated exit. Days after this are neither paid nor counted as absent.
      </p>
    </Modal>
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
    photo_url: initial?.photo_url || '',
    sss_ee: initial?.sss_ee === null || initial?.sss_ee === undefined ? '' : String(initial.sss_ee),
    philhealth_ee: initial?.philhealth_ee === null || initial?.philhealth_ee === undefined ? '' : String(initial.philhealth_ee),
    pagibig_ee: initial?.pagibig_ee === null || initial?.pagibig_ee === undefined ? '' : String(initial.pagibig_ee),
    ot_eligible: !!initial?.ot_eligible,
    withholding: initial?.withholding === null || initial?.withholding === undefined ? '' : String(initial.withholding),
    // Default enrolled (true) unless the saved value is explicitly false.
    sss_enrolled: initial?.sss_enrolled !== false,
  });
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  // Downscale the chosen image to a light square thumbnail in the browser before saving.
  const onPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try { set('photo_url', await fileToSquareThumb(file)); }
    catch (e: any) { toast.error(e.message || 'Could not use that image'); }
    finally { setPhotoBusy(false); }
  };

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
        photo_url: f.photo_url || null,
        sss_ee: f.sss_ee.trim() === '' ? null : Number(f.sss_ee),
        philhealth_ee: f.philhealth_ee.trim() === '' ? null : Number(f.philhealth_ee),
        pagibig_ee: f.pagibig_ee.trim() === '' ? null : Number(f.pagibig_ee),
        ot_eligible: !!f.ot_eligible,
        withholding: f.withholding.trim() === '' ? null : Number(f.withholding),
        sss_enrolled: !!f.sss_enrolled,
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
      <Field label="Photo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Avatar src={f.photo_url} name={f.full_name} size={64} />
          <div>
            <label style={{ ...S.rowBtn, display: 'inline-block', marginLeft: 0, cursor: photoBusy ? 'default' : 'pointer', opacity: photoBusy ? 0.6 : 1 }}>
              {photoBusy ? 'Processing…' : (f.photo_url ? 'Change photo' : 'Upload photo')}
              <input type="file" accept="image/*" disabled={photoBusy} onChange={e => onPhoto(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
            <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '6px' }}>JPG/PNG, under 2 MB. Shown at the time station to verify the face on scan.</div>
          </div>
        </div>
      </Field>
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
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#262626' }}>
          <input type="checkbox" checked={f.ot_eligible} onChange={e => set('ot_eligible', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          OT eligible
        </label>
        <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '4px' }}>Allowed to earn overtime. Only OT-eligible people can have OT approved on the attendance sheet.</div>
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label style={S.label}>Government deductions (employee share)</label>
        <div style={{ fontSize: '10.5px', color: '#8a8a8a', marginTop: '-4px', marginBottom: '8px' }}>
          SSS is auto-computed (gross × 4.5%) every cutoff. PhilHealth &amp; Pag-IBIG apply on the 1st cutoff (1–15) only; the 2nd cutoff (16–end) deducts ₱0.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '4px' }}>SSS (EE)</div>
            {/* SSS-EE is auto-computed at payroll time as gross × 4.5% every cutoff — but ONLY for
                enrolled people. The checkbox is the switch; unchecked → ₱0 SSS every period. (No typed
                amount here; the sss_ee DB column is kept but unused.) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', padding: '7px 10px', borderRadius: '8px', border: '1px solid #ececec', background: '#f7f7f7' }}>
              <input type="checkbox" checked={!!f.sss_enrolled} onChange={e => set('sss_enrolled', e.target.checked)} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
              <span style={{ fontSize: '12.5px', color: '#3d3d3d', fontWeight: 600 }}>SSS-enrolled</span>
            </label>
            <div style={{ fontSize: '10.5px', color: f.sss_enrolled ? '#8a8a8a' : '#b45309', marginTop: '3px' }}>
              {f.sss_enrolled ? 'Auto: gross × 4.5% each cutoff.' : '₱0.00 — not enrolled, no SSS deducted.'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '4px' }}>PhilHealth (EE)</div>
            <TextInput type="number" min="0" step="0.01" inputMode="decimal" value={f.philhealth_ee}
              onChange={e => set('philhealth_ee', e.target.value)} placeholder="—" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '4px' }}>Pag-IBIG (EE)</div>
            <TextInput type="number" min="0" step="0.01" inputMode="decimal" value={f.pagibig_ee}
              onChange={e => set('pagibig_ee', e.target.value)} placeholder="—" />
          </div>
        </div>
        <div style={{ marginTop: '12px', maxWidth: '33%', paddingRight: '8px' }}>
          <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '4px' }}>Withholding tax</div>
          <TextInput type="number" min="0" step="0.01" inputMode="decimal" value={f.withholding}
            onChange={e => set('withholding', e.target.value)} placeholder="—" />
        </div>
        <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '6px' }}>Standing per-cutoff amounts. Leave blank if not set — payroll uses these later.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Hired on"><TextInput type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></Field>
        <Field label="Last day"><TextInput type="date" value={f.last_day} onChange={e => set('last_day', e.target.value)} /></Field>
      </div>
      {initial ? <p style={{ fontSize: '12px', color: '#8a8a8a' }}>QR token is fixed for this person. Lost card? Use <strong>Reissue QR</strong> in the row to mint a new one.</p> : null}
    </Modal>
  );
}
