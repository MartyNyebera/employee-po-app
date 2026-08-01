import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Lock, Plus, Search, Pencil, History, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirm';
import { S, Modal, Field, TextInput, TextArea, PrimaryBtn, GhostBtn, pill, peso } from './crmKit';

// ============================================================================
// Attendance review sheet (Phase 3) — shared by the Admin dashboard and the
// Accounting portal. Both render this same component and hit the same endpoints;
// only the `api` fetch wrapper (admin token vs accounting token) and `role` differ.
//
// It reviews the daily sheet computed in Phase 2 — in/out/hours/flags per person
// per day — lets a reviewer correct a day (which is always logged, never silent)
// and lock a pay period. NO payroll math here (no pesos/rates/OT/holiday).
//   • A correction to an OPEN day: admin or accounting.
//   • A correction to a LOCKED day: admin only (accounting view is read-only).
// ============================================================================

type Api = <T = any>(path: string, init?: RequestInit) => Promise<T>;

interface Period {
  id: number; start_date: string; end_date: string;
  status: 'open' | 'locked'; locked_by?: string | null; locked_at?: string | null;
}
interface Day {
  id: number; person_id: number; work_date: string;
  first_in: string | null; last_out: string | null; worked_minutes: number | null;
  status: string | null; flags: string[]; pay_period_id: number | null;
  is_locked: boolean; is_adjusted: boolean; ot_approved: boolean;
  full_name: string; department?: string | null; position?: string | null; ot_eligible?: boolean;
}
interface Adjustment {
  id: number; field: string; old_value: string | null; new_value: string | null;
  reason: string | null; adjusted_by: string | null; adjusted_at: string;
}
interface Bale { person_id: number; amount: number | string | null; }
interface Sheet { period: Period; rows: Day[]; bale?: Bale[]; }

const fmtDay = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
const fmtHours = (m: number | null) => (m === null || m === undefined) ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const periodLabel = (p: Period) => `${fmtDay(p.start_date)} – ${fmtDay(p.end_date)}, ${p.start_date.slice(0, 4)}`;
const FLAG_LABEL: Record<string, string> = { missing_out: 'Missing OUT', missing_in: 'Missing IN' };

// A stored timestamptz -> the 'YYYY-MM-DDTHH:mm' a <input type="datetime-local"> expects, in Manila.
function toManilaInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find(p => p.type === t)?.value || '';
  let hour = g('hour'); if (hour === '24') hour = '00';
  return `${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}`;
}

function statusPill(status: string | null) {
  if (status === 'complete') return pill('Complete', 'good');
  if (status === 'no_out') return pill('No OUT', 'bad');
  if (status === 'incomplete') return pill('Incomplete', 'bad');
  return pill(status || '—', 'pending');
}

export function TimesheetReview({ api, role }: { api: Api; role: 'admin' | 'accounting' }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Day | null>(null);
  const [historyOf, setHistoryOf] = useState<Day | null>(null);
  // person_id -> BALE amount (string, for the input). Populated from the sheet on load.
  const [baleMap, setBaleMap] = useState<Record<number, string>>({});

  const loadPeriods = async () => {
    try {
      const rows = await api<Period[]>('/attendance/periods');
      setPeriods(rows);
      if (rows.length && selectedId === null) setSelectedId(rows[0].id);
    } catch { toast.error('Failed to load pay periods'); }
  };
  useEffect(() => { loadPeriods(); }, []);

  const loadSheet = async (id: number) => {
    setLoading(true);
    try {
      const s = await api<Sheet>(`/attendance/periods/${id}/sheet`);
      setSheet(s);
      const bm: Record<number, string> = {};
      (s.bale || []).forEach(b => { bm[b.person_id] = b.amount === null || b.amount === undefined ? '' : String(b.amount); });
      setBaleMap(bm);
    } catch { toast.error('Failed to load the review sheet'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (selectedId !== null) loadSheet(selectedId); }, [selectedId]);

  const period = sheet?.period;
  const locked = period?.status === 'locked';
  // ADMIN is the sole editor of attendance values, on open and locked periods alike. Finance/
  // Accounting is view-only at all times — it can see, refresh, and read the correction history,
  // but never open an edit (the server also enforces this: adjust is admin-only, 403 otherwise).
  const canEditRow = (_d: Day) => role === 'admin';
  const canRebuild = role === 'admin' || (!!period && period.status === 'open');

  const departments = useMemo(() => {
    const set = new Set<string>();
    sheet?.rows.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [sheet]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (sheet?.rows || []).filter(r => {
      const matchQ = !q || r.full_name.toLowerCase().includes(q) || (r.position || '').toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q);
      const matchD = !deptFilter || r.department === deptFilter;
      return matchQ && matchD;
    });
  }, [sheet, search, deptFilter]);

  // Group the filtered days by person for a readable, sectioned sheet.
  const groups = useMemo(() => {
    const map = new Map<number, { person: Day; days: Day[]; totalMin: number }>();
    for (const d of filtered) {
      if (!map.has(d.person_id)) map.set(d.person_id, { person: d, days: [], totalMin: 0 });
      const g = map.get(d.person_id)!;
      g.days.push(d);
      g.totalMin += d.worked_minutes || 0;
    }
    return Array.from(map.values());
  }, [filtered]);

  const rebuild = async () => {
    if (selectedId === null) return;
    setBusy(true);
    try {
      const r = await api<{ rebuilt: number }>(`/attendance/periods/${selectedId}/rebuild`, { method: 'POST' });
      await loadSheet(selectedId);
      toast.success(`Rebuilt ${r.rebuilt} day row${r.rebuilt === 1 ? '' : 's'} from punches`);
    } catch (e: any) { toast.error(e.message || 'Rebuild failed'); } finally { setBusy(false); }
  };

  const lock = async () => {
    if (!period) return;
    if (!(await confirmDialog({ title: `Lock ${periodLabel(period)}?`, message: 'Every day in this period is frozen. The Finance view becomes read-only; after this only an admin can make (still-logged) corrections.', confirmLabel: 'Lock period', tone: 'danger' }))) return;
    setBusy(true);
    try {
      await api(`/attendance/periods/${period.id}/lock`, { method: 'POST' });
      await Promise.all([loadPeriods(), loadSheet(period.id)]);
      toast.success('Pay period locked');
    } catch (e: any) { toast.error(e.message || 'Lock failed'); } finally { setBusy(false); }
  };

  // Toggle a day's OT approval (admin-only; server also enforces admin + ot_eligible). Not a
  // pay computation — just the authorization flag. Optimistically update the row.
  const toggleOt = async (day: Day, approved: boolean) => {
    try {
      await api(`/attendance/days/${day.id}/ot`, { method: 'POST', body: JSON.stringify({ approved }) });
      setSheet(s => s ? { ...s, rows: s.rows.map(r => r.id === day.id ? { ...r, ot_approved: approved } : r) } : s);
    } catch (e: any) { toast.error(e.message || 'Could not update OT approval'); }
  };

  // Save a person's BALE for the selected period (admin-only). Blank clears it.
  const saveBale = async (personId: number, amount: string) => {
    if (selectedId === null) return;
    try {
      await api(`/attendance/periods/${selectedId}/bale/${personId}`, { method: 'PUT', body: JSON.stringify({ amount: amount.trim() === '' ? null : Number(amount) }) });
      setBaleMap(m => ({ ...m, [personId]: amount }));
      toast.success('BALE saved');
    } catch (e: any) { toast.error(e.message || 'Could not save BALE'); }
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={S.h1}>Attendance Sheet</h1>
          <p style={S.sub}>Daily in/out per person for a pay period, computed from time-station punches. Corrections are logged; locking freezes the period. No pay is computed here.</p>
        </div>
        <button style={S.addBtn} onClick={() => setShowNew(true)}><Plus size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Pay Period</button>
      </div>

      {/* Period picker + actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: '260px' }}>
          <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
            {periods.length === 0 && <option value="">No pay periods yet</option>}
            {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}{p.status === 'locked' ? '  🔒' : ''}</option>)}
          </select>
        </div>
        {period && (locked
          ? pill('Locked', 'bad')
          : pill('Open', 'good'))}
        {period && canRebuild && <button style={S.rowBtn} onClick={rebuild} disabled={busy}><RefreshCw size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />Rebuild from punches</button>}
        {period && !locked && <button style={{ ...S.rowBtn, borderColor: '#e3ca63', color: '#7a6a0c' }} onClick={lock} disabled={busy}><Lock size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />Lock period</button>}
      </div>

      {locked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '16px', borderRadius: '8px', background: '#f4f4f4', border: '1px solid #d6d6d6', fontSize: '13px', color: '#5a5a5a' }}>
          <ShieldCheck size={15} />
          Locked{period?.locked_at ? ` on ${new Date(period.locked_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : ''}{period?.locked_by ? ` by ${period.locked_by}` : ''}. {role === 'admin' ? 'You can still make corrections — each stays logged.' : 'This sheet is read-only.'}
        </div>
      )}

      {/* Search + department filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8a8a8a' }} />
          <TextInput placeholder="Search name, position or department…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '34px' }} />
        </div>
        <div style={{ minWidth: '180px' }}>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Date</th><th style={S.th}>In</th><th style={S.th}>Out</th>
            <th style={S.th}>Hours</th><th style={S.th}>Status</th><th style={S.th}>OT</th><th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={7}>Loading…</td></tr>
              : !period ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={7}>Create or select a pay period to begin.</td></tr>
              : groups.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={7}>No punched days in this period yet. Click <strong>Rebuild from punches</strong>.</td></tr>
              : groups.map(g => (
                <PersonGroup key={g.person.person_id} group={g} role={role} canEditRow={canEditRow}
                  onEdit={setEditing} onHistory={setHistoryOf} onToggleOt={toggleOt}
                  bale={baleMap[g.person.person_id] ?? ''} onSaveBale={saveBale} periodLocked={locked} />
              ))}
          </tbody>
        </table>
      </div>

      {showNew && <NewPeriodModal api={api} onClose={() => setShowNew(false)} onSaved={async (p) => { setShowNew(false); await loadPeriods(); setSelectedId(p.id); }} />}
      {editing && <AdjustModal api={api} day={editing} onClose={() => setEditing(null)} onSaved={(d) => {
        setEditing(null);
        setSheet(s => s ? { ...s, rows: s.rows.map(r => r.id === d.id ? d : r) } : s);
      }} />}
      {historyOf && <HistoryModal api={api} day={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}

// OT cell: '—' for non-eligible people; a read-only Yes/No for Finance; a clickable toggle for
// admin. Toggling is an authorization flag only — no pay is computed.
function otCell(d: Day, role: 'admin' | 'accounting', onToggleOt: (d: Day, approved: boolean) => void) {
  if (!d.ot_eligible) return <span style={{ fontSize: '12px', color: '#b0b0b0' }} title="Not OT-eligible">—</span>;
  if (role !== 'admin') return d.ot_approved ? pill('Yes', 'good') : <span style={{ fontSize: '12px', color: '#8a8a8a' }}>No</span>;
  const on = d.ot_approved;
  return (
    <button onClick={() => onToggleOt(d, !on)} title="Toggle OT approval for this day"
      style={{ padding: '3px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
        border: '1px solid', ...(on ? { background: '#ececec', borderColor: '#e3ca63', color: '#7a6a0c' } : { background: '#fff', borderColor: '#d6d6d6', color: '#8a8a8a' }) }}>
      {on ? 'Yes' : 'No'}
    </button>
  );
}

// BALE input — editable for admin (saves on blur/Enter), read-only peso text for Finance.
function BaleInput({ personId, value, onSave, editable }: { personId: number; value: string; onSave: (id: number, v: string) => void; editable: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  if (!editable) return <span style={{ fontSize: '13px', color: '#5a5a5a', fontVariantNumeric: 'tabular-nums' }}>{value.trim() === '' ? '—' : peso(Number(value))}</span>;
  return (
    <input type="number" min="0" step="0.01" inputMode="decimal" value={v} placeholder="0.00"
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(personId, v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width: '110px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #d6d6d6', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
  );
}

function PersonGroup({ group, role, canEditRow, onEdit, onHistory, onToggleOt, bale, onSaveBale }: {
  group: { person: Day; days: Day[]; totalMin: number };
  role: 'admin' | 'accounting';
  canEditRow: (d: Day) => boolean; onEdit: (d: Day) => void; onHistory: (d: Day) => void;
  onToggleOt: (d: Day, approved: boolean) => void;
  bale: string; onSaveBale: (personId: number, amount: string) => void;
  periodLocked: boolean;
}) {
  const { person, days, totalMin } = group;
  const meta = [person.department, person.position].filter(Boolean).join(' · ');
  return (
    <>
      <tr>
        <td colSpan={7} style={{ padding: '12px 16px', background: '#f7f7f7', borderBottom: '1px solid #e6e6e6', borderTop: '1px solid #e6e6e6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#000' }}>{person.full_name}</span>
              {meta ? <span style={{ color: '#8a8a8a', fontSize: '13px' }}>{'  ·  ' + meta}</span> : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <span style={{ color: '#5a5a5a', fontSize: '13px' }}>{days.length} day{days.length === 1 ? '' : 's'} · {fmtHours(totalMin)} total</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Cash advance (BALE) for this period">
                <span style={{ fontSize: '11px', color: '#8a8a8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>BALE</span>
                <BaleInput personId={person.person_id} value={bale} onSave={onSaveBale} editable={role === 'admin'} />
              </span>
            </div>
          </div>
        </td>
      </tr>
      {days.map(d => (
        <tr key={d.id}>
          <td style={S.td}>
            {fmtDay(d.work_date)}
            {d.is_locked ? <Lock size={11} style={{ marginLeft: '6px', verticalAlign: '-1px', color: '#8a8a8a' }} /> : null}
          </td>
          <td style={S.td}>{fmtTime(d.first_in)}</td>
          <td style={S.td}>{fmtTime(d.last_out)}</td>
          <td style={S.td}>{fmtHours(d.worked_minutes)}</td>
          <td style={S.td}>
            {statusPill(d.status)}
            {(d.flags || []).map(f => <span key={f} style={{ marginLeft: '6px', fontSize: '12px', color: '#b91c1c' }}>{FLAG_LABEL[f] || f}</span>)}
            {d.is_adjusted ? <span style={{ marginLeft: '6px', fontSize: '11px', color: '#7a6a0c', fontWeight: 600 }}>· edited</span> : null}
          </td>
          <td style={S.td}>{otCell(d, role, onToggleOt)}</td>
          <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {d.is_adjusted ? <button title="Correction history" style={S.rowBtn} onClick={() => onHistory(d)}><History size={13} /></button> : null}
            {canEditRow(d) ? <button title="Correct this day" style={S.rowBtn} onClick={() => onEdit(d)}><Pencil size={13} /></button> : null}
          </td>
        </tr>
      ))}
    </>
  );
}

// Correct a day. Each changed field is sent as its own logged adjustment (server writes an
// attendance_adjustments row per call). A reason is required. Raw punches are never touched.
function AdjustModal({ api, day, onClose, onSaved }: { api: Api; day: Day; onClose: () => void; onSaved: (d: Day) => void }) {
  const [firstIn, setFirstIn] = useState(toManilaInput(day.first_in));
  const [lastOut, setLastOut] = useState(toManilaInput(day.last_out));
  const [status, setStatus] = useState(day.status || 'incomplete');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const origIn = toManilaInput(day.first_in);
  const origOut = toManilaInput(day.last_out);

  const save = async () => {
    if (!reason.trim()) { toast.error('A reason is required for a correction'); return; }
    const changes: { field: string; value: string }[] = [];
    if (firstIn !== origIn) changes.push({ field: 'first_in', value: firstIn });
    if (lastOut !== origOut) changes.push({ field: 'last_out', value: lastOut });
    if (status !== (day.status || 'incomplete')) changes.push({ field: 'status', value: status });
    if (changes.length === 0) { toast.error('Nothing changed'); return; }
    setSaving(true);
    try {
      let updated: Day | null = null;
      for (const c of changes) {
        updated = await api<Day>(`/attendance/days/${day.id}/adjust`, { method: 'POST', body: JSON.stringify({ ...c, reason: reason.trim() }) });
      }
      toast.success(`Correction logged (${changes.length} field${changes.length === 1 ? '' : 's'})`);
      if (updated) onSaved(updated);
    } catch (e: any) { toast.error(e.message || 'Correction failed'); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Correct — ${day.full_name}, ${fmtDay(day.work_date)}`} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save correction'}</PrimaryBtn></>}>
      <p style={{ fontSize: '12px', color: '#8a8a8a', marginTop: 0 }}>Editing the derived day only — the original scan punches are kept untouched. Every change is recorded with your name and the reason. Times are Manila local; clear a time to blank it.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Time In"><TextInput type="datetime-local" value={firstIn} onChange={e => setFirstIn(e.target.value)} /></Field>
        <Field label="Time Out"><TextInput type="datetime-local" value={lastOut} onChange={e => setLastOut(e.target.value)} /></Field>
      </div>
      <Field label="Status">
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
          <option value="complete">Complete</option>
          <option value="no_out">No OUT (missing clock-out)</option>
          <option value="incomplete">Incomplete</option>
        </select>
      </Field>
      <Field label="Reason *"><TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Forgot to clock out — confirmed left at 5:30 PM with supervisor" /></Field>
    </Modal>
  );
}

function HistoryModal({ api, day, onClose }: { api: Api; day: Day; onClose: () => void }) {
  const [rows, setRows] = useState<Adjustment[] | null>(null);
  useEffect(() => {
    api<Adjustment[]>(`/attendance/days/${day.id}/adjustments`).then(setRows).catch(() => setRows([]));
  }, [day.id]);
  const fieldLabel: Record<string, string> = { first_in: 'Time In', last_out: 'Time Out', status: 'Status' };
  const showVal = (field: string, v: string | null) => v === null || v === '' ? '—' : (field === 'status' ? v : fmtTime(v));
  return (
    <Modal title={`Correction history — ${day.full_name}, ${fmtDay(day.work_date)}`} onClose={onClose}
      footer={<GhostBtn onClick={onClose}>Close</GhostBtn>}>
      {rows === null ? <p style={{ color: '#8a8a8a' }}>Loading…</p>
        : rows.length === 0 ? <p style={{ color: '#8a8a8a' }}>No corrections recorded.</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map(a => (
              <div key={a.id} style={{ padding: '10px 12px', border: '1px solid #e6e6e6', borderRadius: '8px' }}>
                <div style={{ fontSize: '13px', color: '#262626' }}>
                  <strong>{fieldLabel[a.field] || a.field}</strong>: {showVal(a.field, a.old_value)} → <strong>{showVal(a.field, a.new_value)}</strong>
                </div>
                {a.reason ? <div style={{ fontSize: '13px', color: '#5a5a5a', marginTop: '3px' }}>{a.reason}</div> : null}
                <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '4px' }}>{new Date(a.adjusted_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{a.adjusted_by ? ` · ${a.adjusted_by}` : ''}</div>
              </div>
            ))}
          </div>}
    </Modal>
  );
}

// Create a semi-monthly pay period (1–15 or 16–end). The month + half buttons fill the dates,
// which stay editable for an off-cycle window.
function NewPeriodModal({ api, onClose, onSaved }: { api: Api; onClose: () => void; onSaved: (p: Period) => void }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const applyHalf = (half: 'first' | 'second') => {
    if (!/^\d{4}-\d{2}$/.test(month)) { toast.error('Pick a month first'); return; }
    const [y, m] = month.split('-').map(Number);
    if (half === 'first') { setStart(`${month}-01`); setEnd(`${month}-15`); }
    else { const last = new Date(y, m, 0).getDate(); setStart(`${month}-16`); setEnd(`${month}-${String(last).padStart(2, '0')}`); }
  };

  const save = async () => {
    if (!start || !end) { toast.error('Set the start and end dates'); return; }
    if (start > end) { toast.error('Start must be on or before end'); return; }
    setSaving(true);
    try {
      const p = await api<Period>('/attendance/periods', { method: 'POST', body: JSON.stringify({ start, end }) });
      toast.success('Pay period ready');
      onSaved(p);
    } catch (e: any) { toast.error(e.message || 'Could not create the period'); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Pay Period" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create'}</PrimaryBtn></>}>
      <Field label="Month"><TextInput type="month" value={month} onChange={e => setMonth(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button style={S.rowBtn} onClick={() => applyHalf('first')}>1st half (1–15)</button>
        <button style={S.rowBtn} onClick={() => applyHalf('second')}>2nd half (16–end)</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Start *"><TextInput type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="End *"><TextInput type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
