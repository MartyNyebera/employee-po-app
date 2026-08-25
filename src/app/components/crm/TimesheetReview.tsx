import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Lock, Unlock, Plus, Search, Pencil, History, ShieldCheck } from 'lucide-react';
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
  payroll_finalized?: boolean;
}
interface BreakInterval { out: string; ret: string; } // Manila HH:MM of a middle OUT→IN break pair
interface Day {
  id: number; person_id: number; work_date: string;
  first_in: string | null; last_out: string | null; worked_minutes: number | null; break_minutes?: number | null;
  breaks?: BreakInterval[];
  status: string | null; flags: string[]; pay_period_id: number | null;
  is_locked: boolean; is_adjusted: boolean; ot_approved: boolean; early_ot_approved: boolean; late_excused: boolean;
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
// Compact docked-break label: under an hour shows just "35m"; an hour or more shows "1h 15m".
const fmtBreakMin = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
const periodLabel = (p: Period) => `${fmtDay(p.start_date)} – ${fmtDay(p.end_date)}, ${p.start_date.slice(0, 4)}`;
const fmtMon = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'short' }); // '2026-09' → 'Sep'

// DISPLAY ONLY. The stored worked_minutes is the raw in-to-out span; the sheet should show PAID
// hours net of the 12:00–1:00 PM lunch so the column matches what payroll actually pays (a normal
// 8–5 day is an 8h paid day). Net the lunch as the real OVERLAP with 12:00–13:00 — not a flat −60 —
// so partial days don't under-count (leaves 11:00 → no overlap → shows the true 3h span). This
// never touches worked_minutes or any pay math; base pay is a flat daily rate that ignores this.
const LUNCH_START_MIN = 12 * 60, LUNCH_END_MIN = 13 * 60; // 12:00 PM – 1:00 PM
const manilaMinuteOfDay = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const h = Number(parts.find(p => p.type === 'hour')?.value) % 24; // '24' at midnight → 0
  const m = Number(parts.find(p => p.type === 'minute')?.value);
  return h * 60 + m;
};
// Lunch-netted minutes (raw span minus the 12–1 lunch overlap). Falls back to the raw span if we
// can't place the times. This is the pre-break figure.
const lunchNetMinutes = (d: Day): number | null => {
  if (d.worked_minutes === null || d.worked_minutes === undefined) return null;
  if (!d.first_in || !d.last_out) return d.worked_minutes;
  const inMin = manilaMinuteOfDay(d.first_in), outMin = manilaMinuteOfDay(d.last_out);
  const overlap = Math.max(0, Math.min(outMin, LUNCH_END_MIN) - Math.max(inMin, LUNCH_START_MIN));
  return Math.max(0, d.worked_minutes - overlap);
};
const breakOf = (d: Day): number => Math.max(0, Number(d.break_minutes) || 0);
// Paid minutes for display = lunch-netted MINUS the day's unpaid personal-business break. This is
// display only and mirrors what payroll already docks (break_minutes × per-minute rate) — no pay is
// computed here. On a no-worked-minutes day (no OUT) this is null and no break is shown.
const paidMinutes = (d: Day): number | null => {
  const ln = lunchNetMinutes(d);
  if (ln === null) return null;
  return Math.max(0, ln - breakOf(d));
};
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

  // Group the filtered days by person for a readable, sectioned sheet. totalMin is net of both lunch
  // and break; breakMin sums the days' docked breaks (only where a paid figure exists, so the total
  // and its break note stay consistent).
  const groups = useMemo(() => {
    const map = new Map<number, { person: Day; days: Day[]; totalMin: number; breakMin: number }>();
    for (const d of filtered) {
      if (!map.has(d.person_id)) map.set(d.person_id, { person: d, days: [], totalMin: 0, breakMin: 0 });
      const g = map.get(d.person_id)!;
      g.days.push(d);
      g.totalMin += paidMinutes(d) || 0;
      if (lunchNetMinutes(d) !== null) g.breakMin += breakOf(d);
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

  // Unlock re-opens a locked period (admin only; server enforces it). A finalized payroll must be
  // un-finalized first — the button is hidden then, and the server also refuses (409).
  const unlock = async () => {
    if (!period) return;
    if (!(await confirmDialog({ title: `Unlock ${periodLabel(period)}?`, message: 'This re-opens the period: its days become editable again and Rebuild-from-punches can run. Lock it again and recompute payroll when you are done.', confirmLabel: 'Unlock period', tone: 'danger' }))) return;
    setBusy(true);
    try {
      await api(`/attendance/periods/${period.id}/unlock`, { method: 'POST' });
      await Promise.all([loadPeriods(), loadSheet(period.id)]);
      toast.success('Pay period unlocked — now open');
    } catch (e: any) { toast.error(e.message || 'Unlock failed'); } finally { setBusy(false); }
  };

  // Toggle a day's OT approval (admin-only; the per-day toggle is the sole OT gate). Not a pay
  // computation — just an authorization flag. `kind` picks the bucket: 'late' (regular/after-shift,
  // ot_approved) or 'early' (pre-shift-start, early_ot_approved). They are independent and stack.
  const toggleOt = async (day: Day, kind: 'late' | 'early', approved: boolean) => {
    const path = kind === 'early' ? `/attendance/days/${day.id}/early-ot` : `/attendance/days/${day.id}/ot`;
    const field = kind === 'early' ? 'early_ot_approved' : 'ot_approved';
    try {
      await api(path, { method: 'POST', body: JSON.stringify({ approved }) });
      setSheet(s => s ? { ...s, rows: s.rows.map(r => r.id === day.id ? { ...r, [field]: approved } : r) } : s);
    } catch (e: any) { toast.error(e.message || 'Could not update OT approval'); }
  };

  // Toggle a day's "Excuse Late" flag (admin-only). Authorizes a late start so the payroll compute
  // waives that day's late penalty — the real IN/OUT stay on record and the day pays the full rate.
  const toggleExcuseLate = async (day: Day, excused: boolean) => {
    try {
      await api(`/attendance/days/${day.id}/excuse-late`, { method: 'POST', body: JSON.stringify({ excused }) });
      setSheet(s => s ? { ...s, rows: s.rows.map(r => r.id === day.id ? { ...r, late_excused: excused } : r) } : s);
    } catch (e: any) { toast.error(e.message || 'Could not update Excuse Late'); }
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
        {period && locked && role === 'admin' && !period.payroll_finalized && <button style={{ ...S.rowBtn, borderColor: '#e3ca63', color: '#7a6a0c' }} onClick={unlock} disabled={busy}><Unlock size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />Unlock period</button>}
      </div>

      {locked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '16px', borderRadius: '8px', background: '#f4f4f4', border: '1px solid #d6d6d6', fontSize: '13px', color: '#5a5a5a' }}>
          <ShieldCheck size={15} />
          Locked{period?.locked_at ? ` on ${new Date(period.locked_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : ''}{period?.locked_by ? ` by ${period.locked_by}` : ''}. {role === 'admin' ? (period?.payroll_finalized ? 'Payroll is finalized — un-finalize it in Payroll Review before you can unlock.' : 'You can still make corrections (logged), or Unlock to re-open the period.') : 'This sheet is read-only.'}
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
            <th style={S.th} title="Mid-day personal-business break (docked)">Break</th>
            <th style={S.th}>Hours</th><th style={S.th}>Status</th>
            <th style={S.th} title="Pre-shift-start OT (no buffer)">Early OT</th>
            <th style={S.th} title="After-shift OT (needs the 1h buffer)">Late OT</th>
            <th style={S.th} title="Authorized late start — waives this day's late penalty (full rate still paid)">Excuse Late</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={10}>Loading…</td></tr>
              : !period ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={10}>Create or select a pay period to begin.</td></tr>
              : groups.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={10}>No punched days in this period yet. Click <strong>Rebuild from punches</strong>.</td></tr>
              : groups.map(g => (
                <PersonGroup key={g.person.person_id} group={g} role={role} canEditRow={canEditRow}
                  onEdit={setEditing} onHistory={setHistoryOf} onToggleOt={toggleOt} onToggleExcuseLate={toggleExcuseLate}
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

// One OT-approval cell for a given bucket ('early' or 'late'): a read-only Yes/No for Finance; a
// clickable toggle for admin. The per-day toggle is the SOLE gate for OT pay, so it shows for
// everyone (no permanent ot_eligible flag gates it anymore). The two buckets are independent.
function otCell(d: Day, kind: 'early' | 'late', role: 'admin' | 'accounting', onToggleOt: (d: Day, kind: 'early' | 'late', approved: boolean) => void) {
  const on = kind === 'early' ? d.early_ot_approved : d.ot_approved;
  if (role !== 'admin') return on ? pill('Yes', 'good') : <span style={{ fontSize: '12px', color: '#8a8a8a' }}>No</span>;
  return (
    <button onClick={() => onToggleOt(d, kind, !on)} title={`Toggle ${kind === 'early' ? 'EARLY' : 'LATE'} OT approval for this day`}
      style={{ padding: '3px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
        border: '1px solid', ...(on ? { background: '#ececec', borderColor: '#e3ca63', color: '#7a6a0c' } : { background: '#fff', borderColor: '#d6d6d6', color: '#8a8a8a' }) }}>
      {on ? 'Yes' : 'No'}
    </button>
  );
}

// "Excuse Late" cell: read-only Yes/No for Finance; a clickable toggle for admin. Shows on any day.
// When on, the payroll compute waives that day's late penalty (full rate still paid; real IN kept).
function excuseLateCell(d: Day, role: 'admin' | 'accounting', onToggle: (d: Day, excused: boolean) => void) {
  const on = !!d.late_excused;
  if (role !== 'admin') return on ? pill('Yes', 'good') : <span style={{ fontSize: '12px', color: '#8a8a8a' }}>No</span>;
  return (
    <button onClick={() => onToggle(d, !on)} title="Toggle Excuse Late — an authorized late start (waives this day's late penalty)"
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

function PersonGroup({ group, role, canEditRow, onEdit, onHistory, onToggleOt, onToggleExcuseLate, bale, onSaveBale }: {
  group: { person: Day; days: Day[]; totalMin: number; breakMin: number };
  role: 'admin' | 'accounting';
  canEditRow: (d: Day) => boolean; onEdit: (d: Day) => void; onHistory: (d: Day) => void;
  onToggleOt: (d: Day, kind: 'early' | 'late', approved: boolean) => void;
  onToggleExcuseLate: (d: Day, excused: boolean) => void;
  bale: string; onSaveBale: (personId: number, amount: string) => void;
  periodLocked: boolean;
}) {
  const { person, days, totalMin, breakMin } = group;
  const meta = [person.department, person.position].filter(Boolean).join(' · ');
  return (
    <>
      <tr>
        <td colSpan={10} style={{ padding: '12px 16px', background: '#f7f7f7', borderBottom: '1px solid #e6e6e6', borderTop: '1px solid #e6e6e6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#000' }}>{person.full_name}</span>
              {meta ? <span style={{ color: '#8a8a8a', fontSize: '13px' }}>{'  ·  ' + meta}</span> : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <span style={{ color: '#5a5a5a', fontSize: '13px' }}>
                {days.length} day{days.length === 1 ? '' : 's'} · {fmtHours(totalMin)} total
                {breakMin > 0 ? <span style={{ color: '#7a6a0c' }}> · − {fmtHours(breakMin)} break</span> : null}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Cash advance (BALE) for this period">
                <span style={{ fontSize: '11px', color: '#8a8a8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>BALE</span>
                <BaleInput personId={person.person_id} value={bale} onSave={onSaveBale} editable={role === 'admin'} />
              </span>
            </div>
          </div>
        </td>
      </tr>
      {days.map(d => {
        const brk = breakOf(d);
        // Show EVERY mid-day break (each middle OUT→IN pair) so an out-and-back is always visible —
        // including one that docked 0 because it fell inside the free 12:00–1:00 lunch window, shown
        // with a "free" label. Keyed off the breaks array (the pairs), NOT break_minutes, so 0-dock
        // breaks still render. A straight 2-tap day has no middle pair → "—".
        const brks = d.breaks || [];
        const hasBreak = brks.length > 0;
        const breakLabel = brks.length === 1 ? `${brks[0].out}–${brks[0].ret}` : `${brks.length} breaks`;
        return (
          <tr key={d.id}>
            <td style={S.td}>
              {fmtDay(d.work_date)}
              {d.is_locked ? <Lock size={11} style={{ marginLeft: '6px', verticalAlign: '-1px', color: '#8a8a8a' }} /> : null}
            </td>
            <td style={S.td}>{fmtTime(d.first_in)}</td>
            <td style={S.td}>{fmtTime(d.last_out)}</td>
            <td style={S.td}>
              {hasBreak
                ? <span style={{ fontSize: '12.5px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: brk > 0 ? '#7a6a0c' : '#6b7280' }}>
                    {breakLabel} · {brk > 0 ? fmtBreakMin(brk) : <span style={{ fontStyle: 'italic' }}>free</span>}
                  </span>
                : <span style={{ color: '#c0c0c0' }}>—</span>}
            </td>
            <td style={S.td}>{fmtHours(paidMinutes(d))}</td>
            <td style={S.td}>
              {statusPill(d.status)}
              {(d.flags || []).map(f => <span key={f} style={{ marginLeft: '6px', fontSize: '12px', color: '#b91c1c' }}>{FLAG_LABEL[f] || f}</span>)}
              {d.is_adjusted ? <span style={{ marginLeft: '6px', fontSize: '11px', color: '#7a6a0c', fontWeight: 600 }}>· edited</span> : null}
            </td>
            <td style={S.td}>{otCell(d, 'early', role, onToggleOt)}</td>
            <td style={S.td}>{otCell(d, 'late', role, onToggleOt)}</td>
            <td style={S.td}>{excuseLateCell(d, role, onToggleExcuseLate)}</td>
            <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {d.is_adjusted ? <button title="Correction history" style={S.rowBtn} onClick={() => onHistory(d)}><History size={13} /></button> : null}
              {canEditRow(d) ? <button title="Correct this day" style={S.rowBtn} onClick={() => onEdit(d)}><Pencil size={13} /></button> : null}
            </td>
          </tr>
        );
      })}
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

// A suggested next period computed by the server from the calendar + Holidays tab (see the
// /attendance/periods/suggest endpoint). Payday is the buffer target; end = the workday before it.
interface Suggestion { start: string; end: string; payday: string; cutoff_half: 'first' | 'second'; cutoff_month: string | null; }

// Create a semi-monthly pay period. On open we ASK the server for a suggested start/cutoff-end/payday
// (derived from Kimoel's cutoff scheme + the holidays table + the last period's end) and pre-fill it,
// but nothing is forced: the month + half buttons and the date inputs stay fully editable, so a
// reviewer can accept the suggestion or override any date for an off-cycle window.
function NewPeriodModal({ api, onClose, onSaved }: { api: Api; onClose: () => void; onSaved: (p: Period) => void }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [loadingSug, setLoadingSug] = useState(true);

  // Fetch the suggestion once on open and pre-fill the dates. A failure is non-fatal — the form still
  // works as a plain manual editor, so we only clear the loading state and leave the fields blank.
  useEffect(() => {
    let live = true;
    api<{ suggestions: Suggestion[] }>('/attendance/periods/suggest')
      .then(r => {
        if (!live) return;
        const s = r.suggestions?.[0];
        if (s) { setSug(s); setStart(s.start); setEnd(s.end); setMonth(s.start.slice(0, 7)); }
      })
      .catch(() => {})
      .finally(() => { if (live) setLoadingSug(false); });
    return () => { live = false; };
  }, [api]);

  const applySuggestion = () => {
    if (!sug) return;
    setStart(sug.start); setEnd(sug.end); setMonth(sug.start.slice(0, 7));
  };

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

  // True once the user has moved off the suggested dates — lets us relabel the banner button.
  const overridden = !!sug && (start !== sug.start || end !== sug.end);

  return (
    <Modal title="New Pay Period" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create'}</PrimaryBtn></>}>
      {loadingSug ? (
        <div style={{ ...S.sub, marginBottom: '14px' }}>Calculating a suggested cutoff…</div>
      ) : sug ? (
        <div style={{ background: '#f4f7ff', border: '1px solid #dbe4ff', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {pill(sug.cutoff_half === 'first' ? `1st cutoff${sug.cutoff_month ? ` · ${fmtMon(sug.cutoff_month)}` : ''}` : '2nd cutoff', sug.cutoff_half === 'first' ? 'good' : 'pending')}
            <span style={{ fontWeight: 600 }}>Suggested: {fmtDay(sug.start)} – {fmtDay(sug.end)}</span>
          </div>
          <div style={{ ...S.sub, marginTop: '4px' }}>Payday {fmtDay(sug.payday)} · cutoff ends one workday before payday (rest days &amp; holidays skipped).</div>
          {overridden && <button style={{ ...S.rowBtn, marginTop: '8px' }} onClick={applySuggestion}>Reset to suggestion</button>}
        </div>
      ) : null}
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
