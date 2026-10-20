import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Lock, Unlock, Plus, Search, Pencil, History, ShieldCheck, Home, Fingerprint } from 'lucide-react';
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
//   • BALE (cash advance) input: admin or accounting — the accountant runs payroll and approves
//     the advances, so she enters them. Every change is logged server-side (who/old/new/when).
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
  is_wfh?: boolean;
  // Admin waived this day's personal-break DEDUCTION (the break itself stays as recorded).
  break_excused?: boolean;
  // Live (non-voided) manual punches on this day, so the row can say a person added one.
  manual_punch_count?: number;
  full_name: string; department?: string | null; position?: string | null; ot_eligible?: boolean;
}
interface Adjustment {
  id: number; field: string; old_value: string | null; new_value: string | null;
  reason: string | null; adjusted_by: string | null; adjusted_at: string;
}
interface Bale {
  person_id: number; amount: number | string | null;
  // Who last set it and when. NULL on the rows that predate the change log — shown as nothing
  // rather than guessed at.
  updated_by?: string | null; updated_at?: string | null;
}
// Present/Half/Absent per person for this period, using the SAME classification computePayroll uses
// (server/index.js classifyScheduledDay) -- this is what the eventual payslip's day count will be.
// naive_days is a plain count of attendance_days rows in range, kept for comparison: it disagrees
// whenever someone has a no_out day (payroll discounts it to a half), a true absence (no row exists
// at all, so a raw row count can't see it), or a worked Sunday/holiday (paid separately, excluded
// from present/half/absent entirely) -- none of which is a bug, but nothing used to explain it.
interface Classification { person_id: number; present: number; half: number; absent: number; naive_days: number; }
// empty_days: scheduled dates in this period on which NOBODY has an attendance row. Usually a closed
// office or an unrecorded off-site day rather than a genuine all-hands absence — and costly, because
// an unworked regular holiday only pays when the preceding scheduled day has attendance.
interface Sheet { period: Period; rows: Day[]; bale?: Bale[]; classification?: Classification[]; empty_days?: string[]; }
interface PersonOption { id: number; full_name: string; }

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
// What payroll actually CHARGES for the break: the recorded break, unless the admin excused it. The
// break itself (and its label) stay as recorded either way; only the deduction is waived.
const dockedOf = (d: Day): number => d.break_excused ? 0 : breakOf(d);
// Paid minutes for display = lunch-netted MINUS the day's unpaid personal-business break. This is
// display only and mirrors what payroll already docks (break_minutes × per-minute rate) — no pay is
// computed here. On a no-worked-minutes day (no OUT) this is null and no break is shown.
const paidMinutes = (d: Day): number | null => {
  const ln = lunchNetMinutes(d);
  if (ln === null) return null;
  return Math.max(0, ln - dockedOf(d));
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

// `focus` (the admin dashboard's missed-scan card) asks the sheet to open on one person's day: pick the pay
// period that contains the date, make sure the day row exists, then scroll to it and highlight it.
export interface SheetFocus { personId: number; date: string; nonce: number }
export function TimesheetReview({ api, role, focus }: { api: Api; role: 'admin' | 'accounting'; focus?: SheetFocus | null }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [wfhFor, setWfhFor] = useState<string | null>(null); // date to seed the WFH modal with, '' = none picked
  const [editing, setEditing] = useState<Day | null>(null);
  const [historyOf, setHistoryOf] = useState<Day | null>(null);
  const [punchesOf, setPunchesOf] = useState<Day | null>(null);
  // The day a missed-scan link pointed at (highlighted until the admin moves on).
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const pendingFocus = useRef<SheetFocus | null>(null);
  // person_id -> BALE amount (string, for the input). Populated from the sheet on load.
  const [baleMap, setBaleMap] = useState<Record<number, string>>({});
  // person_id -> who last set that BALE and when, for the row's tooltip. Separate from baleMap
  // because baleMap is the live input buffer and gets overwritten as she types.
  const [baleMeta, setBaleMeta] = useState<Record<number, { by: string | null; at: string | null }>>({});

  const loadPeriods = async () => {
    try {
      const rows = await api<Period[]>('/attendance/periods');
      setPeriods(rows);
      if (rows.length && selectedId === null) {
        const f = pendingFocus.current;
        const hit = f ? rows.find(p => f.date >= p.start_date && f.date <= p.end_date) : null;
        setSelectedId((hit || rows[0]).id);
      }
    } catch { toast.error('Failed to load pay periods'); }
  };
  useEffect(() => { loadPeriods(); }, []);

  // Follow a missed-scan link: remember the target, jump to the period that holds the date, and let
  // loadSheet finish the job (a day row only exists once it has been rebuilt).
  useEffect(() => {
    if (!focus) return;
    pendingFocus.current = focus;
    const hit = periods.find(p => focus.date >= p.start_date && focus.date <= p.end_date);
    if (!hit) { if (periods.length) toast.error('No pay period covers that date yet — create one to fix it here.'); return; }
    if (hit.id === selectedId) loadSheet(hit.id); else setSelectedId(hit.id);
  }, [focus?.nonce, periods.length]);

  const loadSheet = async (id: number) => {
    setLoading(true);
    try {
      const s = await api<Sheet>(`/attendance/periods/${id}/sheet`);
      setSheet(s);
      const bm: Record<number, string> = {};
      const meta: Record<number, { by: string | null; at: string | null }> = {};
      (s.bale || []).forEach(b => {
        bm[b.person_id] = b.amount === null || b.amount === undefined ? '' : String(b.amount);
        meta[b.person_id] = { by: b.updated_by ?? null, at: b.updated_at ?? null };
      });
      setBaleMap(bm);
      setBaleMeta(meta);
      // Finish a pending missed-scan jump. If that day has no row yet, rebuild just that date (an
      // idempotent roll-up of the raw punches, the same thing the Rebuild button does) and reload once.
      const f = pendingFocus.current;
      if (f && f.date >= s.period.start_date && f.date <= s.period.end_date) {
        let row = s.rows.find(r => r.person_id === f.personId && r.work_date === f.date);
        if (!row && role === 'admin' && s.period.status === 'open') {
          try {
            await api('/attendance/rebuild-days', { method: 'POST', body: JSON.stringify({ start: f.date, end: f.date }) });
            const s2 = await api<Sheet>(`/attendance/periods/${id}/sheet`);
            setSheet(s2);
            row = s2.rows.find(r => r.person_id === f.personId && r.work_date === f.date);
          } catch { /* the sheet still loaded; the day just will not be highlighted */ }
        }
        pendingFocus.current = null;
        if (row) {
          const rid = row.id;
          setHighlightId(rid);
          setTimeout(() => document.getElementById(`ts-day-${rid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }
      }
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
  // ...with ONE exception: the BALE. The accountant owns payroll and approves the cash advances, so
  // she types them even though the rest of this sheet stays read-only for her. Both roles are named
  // explicitly rather than inverted from a "not admin" test, so adding a third role later cannot
  // hand it BALE access by accident. The server gate is the real one (requireRole on the PUT) —
  // this only decides whether an input or static text renders.
  const canSetBale = role === 'admin' || role === 'accounting';
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
      if (lunchNetMinutes(d) !== null) g.breakMin += dockedOf(d);
    }
    return Array.from(map.values());
  }, [filtered]);

  const classByPerson = useMemo(() => {
    const map = new Map<number, Classification>();
    (sheet?.classification || []).forEach(c => map.set(c.person_id, c));
    return map;
  }, [sheet]);

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

  // Toggle a day's "Excuse Break" flag (admin-only, unlocked days only -- the server refuses a locked
  // one). Waives that day's personal-break deduction; the punches and the break display are unchanged.
  const toggleExcuseBreak = async (day: Day, excused: boolean) => {
    try {
      await api(`/attendance/days/${day.id}/excuse-break`, { method: 'POST', body: JSON.stringify({ excused }) });
      setSheet(s => s ? { ...s, rows: s.rows.map(r => r.id === day.id ? { ...r, break_excused: excused } : r) } : s);
    } catch (e: any) { toast.error(e.message || 'Could not update Excuse Break'); }
  };

  // Save a person's BALE for the selected period (admin or accounting). Blank clears it. The
  // computation is untouched — this writes the same row the same way; only who may call it changed.
  const saveBale = async (personId: number, amount: string) => {
    if (selectedId === null) return;
    try {
      const saved = await api<Bale>(`/attendance/periods/${selectedId}/bale/${personId}`, { method: 'PUT', body: JSON.stringify({ amount: amount.trim() === '' ? null : Number(amount) }) });
      setBaleMap(m => ({ ...m, [personId]: amount }));
      // Reflect the audit stamp the server just wrote, so the row names the editor without a refetch.
      setBaleMeta(m => ({ ...m, [personId]: { by: saved?.updated_by ?? null, at: saved?.updated_at ?? null } }));
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
        {/* Period-scoped on purpose: a person who worked off-site has NO rows, so they render no group
            at all and there is no row anywhere on this screen to hang a per-day button on. */}
        {period && role === 'admin' && <button style={S.rowBtn} onClick={() => setWfhFor('')} disabled={busy}><Home size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />Record WFH day</button>}
      </div>

      {/* A whole scheduled day with no attendance anywhere is the failure this feature exists for:
          it silently denies everyone the following regular holiday's pay. Name the dates plainly. */}
      {role === 'admin' && (sheet?.empty_days || []).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', marginBottom: '16px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fcd34d', fontSize: '13px', color: '#78350f' }}>
          <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>No attendance recorded at all on {(sheet?.empty_days || []).map(fmtDay).join(', ')}.</strong>{' '}
            If the office was closed that day, nothing is wrong. If anyone worked from home, record it —
            an unworked regular holiday only pays when the scheduled day before it has attendance.
            {(sheet?.empty_days || []).map(d => (
              <button key={d} style={{ ...S.rowBtn, marginLeft: '8px', marginTop: '6px' }} onClick={() => setWfhFor(d)}>
                Record WFH for {fmtDay(d)}
              </button>
            ))}
          </div>
        </div>
      )}

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
            <th style={S.th} title="Waives this day's personal-break deduction (the break itself stays recorded)">Excuse Break</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={11}>Loading…</td></tr>
              : !period ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={11}>Create or select a pay period to begin.</td></tr>
              : groups.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={11}>No punched days in this period yet. Click <strong>Rebuild from punches</strong>.</td></tr>
              : groups.map(g => (
                <PersonGroup key={g.person.person_id} group={g} role={role} canEditRow={canEditRow}
                  onEdit={setEditing} onHistory={setHistoryOf} onToggleOt={toggleOt} onToggleExcuseLate={toggleExcuseLate} onToggleExcuseBreak={toggleExcuseBreak}
                  onPunches={setPunchesOf} highlightId={highlightId}
                  bale={baleMap[g.person.person_id] ?? ''} onSaveBale={saveBale} periodLocked={locked}
                  canSetBale={canSetBale} baleMeta={baleMeta[g.person.person_id]}
                  classification={classByPerson.get(g.person.person_id)} />
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
      {punchesOf && <PunchesModal api={api} day={punchesOf} onClose={() => setPunchesOf(null)}
        onChanged={async () => { if (selectedId !== null) await loadSheet(selectedId); }} />}
      {wfhFor !== null && period && (
        <WfhModal api={api} period={period} seedDate={wfhFor} onClose={() => setWfhFor(null)}
          onSaved={async () => { setWfhFor(null); if (selectedId !== null) await loadSheet(selectedId); }} />
      )}
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

// "Excuse Break" cell: read-only Yes/No for Finance; a toggle for admin. Only meaningful where there is
// a docked break, so a day with none shows a dash. Locked days cannot be toggled (the server refuses too).
function excuseBreakCell(d: Day, role: 'admin' | 'accounting', onToggle: (d: Day, excused: boolean) => void) {
  const on = !!d.break_excused;
  const hasDock = breakOf(d) > 0;
  if (!hasDock && !on) return <span style={{ color: '#c0c0c0' }}>—</span>;
  if (role !== 'admin' || d.is_locked) return on ? pill('Yes', 'good') : <span style={{ fontSize: '12px', color: '#8a8a8a' }}>No</span>;
  return (
    <button onClick={() => onToggle(d, !on)} title="Toggle Excuse Break — waives this day's personal-break deduction (the break stays recorded)"
      style={{ padding: '3px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
        border: '1px solid', ...(on ? { background: '#ececec', borderColor: '#e3ca63', color: '#7a6a0c' } : { background: '#fff', borderColor: '#d6d6d6', color: '#8a8a8a' }) }}>
      {on ? 'Yes' : 'No'}
    </button>
  );
}

// BALE input — editable for admin AND accounting (saves on blur/Enter), read-only peso text for
// any other viewer. `editable` is decided by the caller; this component only renders.
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

function PersonGroup({ group, role, canEditRow, onEdit, onHistory, onToggleOt, onToggleExcuseLate, onToggleExcuseBreak, onPunches, highlightId, bale, onSaveBale, canSetBale, baleMeta, classification }: {
  group: { person: Day; days: Day[]; totalMin: number; breakMin: number };
  role: 'admin' | 'accounting';
  canEditRow: (d: Day) => boolean; onEdit: (d: Day) => void; onHistory: (d: Day) => void;
  onToggleOt: (d: Day, kind: 'early' | 'late', approved: boolean) => void;
  onToggleExcuseLate: (d: Day, excused: boolean) => void;
  onToggleExcuseBreak: (d: Day, excused: boolean) => void;
  onPunches: (d: Day) => void;
  highlightId: number | null;
  bale: string; onSaveBale: (personId: number, amount: string) => void;
  canSetBale: boolean; baleMeta?: { by: string | null; at: string | null };
  periodLocked: boolean;
  classification?: Classification;
}) {
  const { person, days, totalMin, breakMin } = group;
  const meta = [person.department, person.position].filter(Boolean).join(' · ');
  return (
    <>
      <tr>
        <td colSpan={11} style={{ padding: '12px 16px', background: '#f7f7f7', borderBottom: '1px solid #e6e6e6', borderTop: '1px solid #e6e6e6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#000' }}>{person.full_name}</span>
              {meta ? <span style={{ color: '#8a8a8a', fontSize: '13px' }}>{'  ·  ' + meta}</span> : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <span style={{ color: '#5a5a5a', fontSize: '13px' }}>
                {days.length} punched day{days.length === 1 ? '' : 's'} · {fmtHours(totalMin)} total
                {breakMin > 0 ? <span style={{ color: '#7a6a0c' }}> · − {fmtHours(breakMin)} break</span> : null}
              </span>
              {/* This is what the payslip's Qty WILL show for this person -- same classification
                  computePayroll uses, combined the same way payslipPrint.ts does (present + 0.5 per
                  half day) so this number matches the payslip's "Reg. day" Qty exactly, not just the
                  raw present count. It routinely differs from the punched-day count on the left: a
                  no_out day above counts here as half, a true absence (no punch at all) has no row to
                  the left but does count here, and a worked Sunday/holiday counts to the left but not
                  here (it's paid separately). None of that is a bug; this label exists so the two
                  numbers are never mysterious side by side. */}
              {classification && (classification.present || classification.half || classification.absent) ? (() => {
                const qty = classification.present + 0.5 * classification.half;
                const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
                return (
                  <span style={{ fontSize: '12px', color: '#5a5a5a' }}
                    title="What the payslip's Qty will show for this period (Present + ½ per half day) — a missing-OUT day counts as half, a day with no punch at all counts as absent, and a worked Sunday/holiday is paid separately and isn't in this tally. This can differ from the punched-day count on the left; that's expected.">
                    Payroll: <strong style={{ color: '#000' }}>{qtyStr}</strong> days
                    {classification.half > 0 ? <> ({classification.present} present + {classification.half} half)</> : null}
                    {classification.absent > 0 ? <> · <span style={{ color: '#b91c1c' }}>{classification.absent} absent</span></> : null}
                  </span>
                );
              })() : null}
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title={'Cash advance (BALE) for this period — deducted from net pay.'
                  + (baleMeta?.at ? `\nLast set ${new Date(baleMeta.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}${baleMeta.by ? ' by ' + baleMeta.by : ''}.` : '')
                  + '\nEvery change is logged (old value, new value, who, when).'}>
                <span style={{ fontSize: '11px', color: '#8a8a8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>BALE</span>
                <BaleInput personId={person.person_id} value={bale} onSave={onSaveBale} editable={canSetBale} />
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
        //
        // ...but the pairs are punch-derived, and a HAND-ENTERED day has none: it has no punches to
        // pair up, and the sheet endpoint blanks `breaks` for is_adjusted rows regardless. Such a day
        // was therefore docked in both the Hours column and payroll while its Break cell read "—",
        // leaving the row short with nothing on screen to explain it. So fall back to break_minutes:
        // if there is a dock but no pair to name it, still show the dock, labelled "manual".
        const brks = d.breaks || [];
        const hasBreak = brks.length > 0 || brk > 0;
        const breakLabel = brks.length === 1 ? `${brks[0].out}–${brks[0].ret}`
          : brks.length > 1 ? `${brks.length} breaks`
          : 'manual';
        return (
          <tr key={d.id} id={`ts-day-${d.id}`} style={d.id === highlightId ? { background: '#fffbeb', outline: '2px solid #e3ca63', outlineOffset: '-2px' } : undefined}>
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
                    {d.break_excused && brk > 0 ? <span title="Admin excused this break — it is recorded but not deducted" style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 700, color: '#0c7a3a' }}>excused</span> : null}
                  </span>
                : <span style={{ color: '#c0c0c0' }}>—</span>}
            </td>
            <td style={S.td}>{fmtHours(paidMinutes(d))}</td>
            <td style={S.td}>
              {statusPill(d.status)}
              {/* A WFH day was vouched for by an admin, not scanned at a station. Say so on the row —
                  its times are the configured shift, not observed ones, and nothing else distinguishes it. */}
              {d.is_wfh ? <span title="Work from home — recorded by an admin, not a station scan" style={{ marginLeft: '6px', fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>· WFH</span> : null}
              {(d.flags || []).map(f => <span key={f} style={{ marginLeft: '6px', fontSize: '12px', color: '#b91c1c' }}>{FLAG_LABEL[f] || f}</span>)}
              {d.is_adjusted ? <span style={{ marginLeft: '6px', fontSize: '11px', color: '#7a6a0c', fontWeight: 600 }}>· edited</span> : null}
              {(d.manual_punch_count || 0) > 0 ? <span title="An admin added a missed scan on this day — open Punches to see who and why" style={{ marginLeft: '6px', fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>· manual punch</span> : null}
            </td>
            <td style={S.td}>{otCell(d, 'early', role, onToggleOt)}</td>
            <td style={S.td}>{otCell(d, 'late', role, onToggleOt)}</td>
            <td style={S.td}>{excuseLateCell(d, role, onToggleExcuseLate)}</td>
            <td style={S.td}>{excuseBreakCell(d, role, onToggleExcuseBreak)}</td>
            <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {role === 'admin' ? <button title="Punches — see every scan and add a missed one" style={S.rowBtn} onClick={() => onPunches(d)}><Fingerprint size={13} /></button> : null}
              {d.is_adjusted || (d.manual_punch_count || 0) > 0 ? <button title="Correction history" style={S.rowBtn} onClick={() => onHistory(d)}><History size={13} /></button> : null}
              {canEditRow(d) ? <button title="Correct this day" style={S.rowBtn} onClick={() => onEdit(d)}><Pencil size={13} /></button> : null}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// Correct a day. The server logs an attendance_adjustments row per changed FIELD, but both clock
// times travel in ONE request so the IN/OUT pair is validated as it will finally stand.
// A reason is required. Raw punches are never touched.
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
    const times: Record<string, string> = {};
    if (firstIn !== origIn) times.first_in = firstIn;
    if (lastOut !== origOut) times.last_out = lastOut;
    const statusChanged = status !== (day.status || 'incomplete');
    const changed = Object.keys(times).length + (statusChanged ? 1 : 0);
    if (changed === 0) { toast.error('Nothing changed'); return; }
    setSaving(true);
    try {
      let updated: Day | null = null;
      // Both times in ONE request: sent as two, the server checked each new value against the OTHER
      // field's still-stored value, so moving a day from 08:00–17:00 to 18:00–22:00 was refused
      // because 18:00 was compared with the old 17:00. One request also rules out a half-applied edit.
      if (Object.keys(times).length) {
        updated = await api<Day>(`/attendance/days/${day.id}/adjust`, { method: 'POST', body: JSON.stringify({ field: 'times', value: times, reason: reason.trim() }) });
      }
      if (statusChanged) {
        updated = await api<Day>(`/attendance/days/${day.id}/adjust`, { method: 'POST', body: JSON.stringify({ field: 'status', value: status, reason: reason.trim() }) });
      }
      toast.success(`Correction logged (${changed} field${changed === 1 ? '' : 's'})`);
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

// Record a work-from-home day — the only path that brings an attendance row into being without a
// station scan. Deliberately period-scoped and multi-select: the people who need this are precisely
// the ones with NO rows on this screen (no scan, no row, no group rendered, nothing to click), and a
// WFH day is nearly always a whole team at once.
function WfhModal({ api, period, seedDate, onClose, onSaved }:
  { api: Api; period: Period; seedDate: string; onClose: () => void; onSaved: () => void }) {
  const [people, setPeople] = useState<(PersonOption & { status?: string; hired_on?: string | null; last_day?: string | null })[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(seedDate || period.start_date);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<any[]>('/persons').then(rows => setPeople(rows.filter(p => p.status !== 'resigned')))
      .catch(() => { setPeople([]); toast.error('Failed to load the roster'); });
  }, []);

  // Only offer people actually employed on the chosen date — payroll treats days outside someone's
  // hire/last-day window as 'not_employed', so a WFH row there could never be paid.
  const eligible = (people || []).filter(p =>
    (!p.hired_on || date >= String(p.hired_on).slice(0, 10)) &&
    (!p.last_day || date <= String(p.last_day).slice(0, 10)));

  // A Sunday pays at the premium rate, so a WFH row there invents premium pay instead of a normal
  // day. Not blocked — but never silent.
  const isSunday = !!date && new Date(date + 'T00:00:00').getDay() === 0;

  const toggle = (id: number) => setPicked(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const save = async () => {
    if (!picked.size) { toast.error('Pick at least one person'); return; }
    if (!date) { toast.error('Pick a date'); return; }
    if (!reason.trim()) { toast.error('A reason is required for a work-from-home day'); return; }
    setSaving(true);
    let ok = 0; const failed: string[] = [];
    for (const id of picked) {
      try {
        await api('/attendance/days/wfh', { method: 'POST', body: JSON.stringify({ person_id: id, work_date: date, reason: reason.trim() }) });
        ok++;
      } catch (e: any) {
        failed.push(`${eligible.find(p => p.id === id)?.full_name || `#${id}`}: ${e.message || 'failed'}`);
      }
    }
    setSaving(false);
    if (ok) toast.success(`Work-from-home recorded for ${ok} ${ok === 1 ? 'person' : 'people'} — recompute payroll to apply it`);
    failed.forEach(f => toast.error(f));
    if (ok) onSaved();
  };

  return (
    <Modal title="Record a work-from-home day" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : `Record WFH${picked.size ? ` (${picked.size})` : ''}`}</PrimaryBtn></>}>
      <p style={{ fontSize: '12px', color: '#8a8a8a', marginTop: 0 }}>
        Attendance normally comes only from station scans, so an off-site day leaves no record and the
        person counts as absent. This records the day at the configured shift hours for that weekday
        (Saturdays use the Saturday end time). Anyone who already has a row keeps their real scan times.
      </p>
      <Field label="Date">
        <TextInput type="date" value={date} min={period.start_date} max={period.end_date}
          onChange={e => setDate(e.target.value)} />
      </Field>
      {isSunday && (
        <p style={{ fontSize: '12px', color: '#b45309', marginTop: '-4px' }}>
          That date is a Sunday — Sunday work pays at the premium rate, so this will add premium pay,
          not a normal day. Holidays behave the same way.
        </p>
      )}
      <Field label={`Who worked from home${picked.size ? ` — ${picked.size} selected` : ''}`}>
        {people === null
          ? <div style={{ fontSize: '13px', color: '#8a8a8a' }}>Loading roster…</div>
          : eligible.length === 0
            ? <div style={{ fontSize: '13px', color: '#8a8a8a' }}>Nobody on the roster was employed on that date.</div>
            : <div style={{ maxHeight: '190px', overflowY: 'auto', border: '1px solid #d6d6d6', borderRadius: '8px', padding: '6px' }}>
                {eligible.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                    {p.full_name}
                  </label>
                ))}
              </div>}
      </Field>
      <Field label="Reason *">
        <TextArea value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Saturday work-from-home arrangement, approved by management" />
      </Field>
    </Modal>
  );
}

// Every punch on one day -- the scanner's and any an admin added -- plus the "Add missed scan" form.
// A manual punch is stamped MANUAL with who/when/why wherever it appears; scanner rows are never
// editable, and a manual one is only ever voided (kept in the log, struck through), never deleted.
// The server rebuilds the day after each change, so break and OT come out of the normal rules.
interface PunchRow {
  id: number; punch_type: string; punched_at: string; local_time: string; source: string;
  created_at?: string | null; created_by?: string | null; reason?: string | null;
  voided_at?: string | null; voided_by?: string | null; void_reason?: string | null;
}
interface PunchesPayload {
  day_id: number; work_date: string; break_minutes: number; break_excused: boolean; locked: boolean;
  pinned_fields: string[]; punches: PunchRow[];
}
const fmtStamp = (iso?: string | null) => iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

function PunchesModal({ api, day, onClose, onChanged }: { api: Api; day: Day; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<PunchesPayload | null>(null);
  const [time, setTime] = useState('');
  const [type, setType] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState('');
  const [release, setRelease] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voidId, setVoidId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = async () => {
    try { setData(await api<PunchesPayload>(`/attendance/days/${day.id}/punches`)); }
    catch { toast.error('Could not load the punches'); }
  };
  useEffect(() => { load(); }, [day.id]);

  const pinned = (data?.pinned_fields || []).length > 0;
  const blocked = !!data?.locked;

  const add = async () => {
    if (!/^\d{2}:\d{2}$/.test(time)) { toast.error('Enter the time of the missed scan'); return; }
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    if (pinned && !release) { toast.error('Tick the box to release the hand-set times first'); return; }
    setSaving(true);
    try {
      const r = await api<{ sequence_ok: boolean }>('/attendance/punches/manual', { method: 'POST', body: JSON.stringify({
        person_id: day.person_id, work_date: day.work_date, time, punch_type: type, reason: reason.trim(), release_pins: pinned && release }) });
      toast.success(`Manual ${type.toUpperCase()} added at ${time}`);
      if (!r.sequence_ok) toast.warning('The punches for this day no longer alternate IN / OUT — check the list.');
      setTime(''); setReason(''); setRelease(false);
      await load(); await onChanged();
    } catch (e: any) { toast.error(e.message || 'Could not add the punch'); } finally { setSaving(false); }
  };

  const doVoid = async () => {
    if (voidId === null) return;
    if (!voidReason.trim()) { toast.error('A reason is required to void a punch'); return; }
    setSaving(true);
    try {
      await api(`/attendance/punches/${voidId}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      toast.success('Manual punch voided');
      setVoidId(null); setVoidReason('');
      await load(); await onChanged();
    } catch (e: any) { toast.error(e.message || 'Could not void the punch'); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Punches — ${day.full_name}, ${fmtDay(day.work_date)}`} onClose={onClose} footer={<GhostBtn onClick={onClose}>Close</GhostBtn>}>
      {data === null ? <p style={{ color: '#8a8a8a' }}>Loading…</p> : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {data.punches.length === 0 ? <p style={{ color: '#8a8a8a', margin: 0 }}>No punches on this day.</p> : data.punches.map(p => {
              const manual = p.source === 'manual';
              const voided = !!p.voided_at;
              return (
                <div key={p.id} style={{ padding: '8px 12px', border: '1px solid #e6e6e6', borderRadius: '8px', background: manual ? '#f4f7ff' : '#fff', opacity: voided ? 0.65 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <strong style={{ fontVariantNumeric: 'tabular-nums', textDecoration: voided ? 'line-through' : 'none' }}>{fmtTime(p.punched_at)}</strong>
                    {pill(p.punch_type.toUpperCase(), p.punch_type === 'in' ? 'good' : 'pending')}
                    {manual
                      ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>MANUAL</span>
                      : <span style={{ fontSize: '11px', color: '#8a8a8a' }}>scanner</span>}
                    {voided ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#b91c1c' }}>VOIDED</span> : null}
                    {manual && !voided && !blocked
                      ? <button style={{ ...S.rowBtn, marginLeft: 'auto' }} onClick={() => { setVoidId(p.id); setVoidReason(''); }}>Void</button> : null}
                  </div>
                  {manual ? (
                    <div style={{ fontSize: '12px', color: '#5a5a5a', marginTop: '4px' }}>
                      Added by {p.created_by || 'admin'} · {fmtStamp(p.created_at)}{p.reason ? ` — “${p.reason}”` : ''}
                      {voided ? <div style={{ color: '#b91c1c' }}>Voided by {p.voided_by || 'admin'} · {fmtStamp(p.voided_at)}{p.void_reason ? ` — “${p.void_reason}”` : ''}</div> : null}
                    </div>
                  ) : null}
                  {voidId === p.id ? (
                    <div style={{ marginTop: '8px' }}>
                      <TextArea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Why is this punch being voided?" />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <PrimaryBtn onClick={doVoid} disabled={saving}>Void punch</PrimaryBtn>
                        <GhostBtn onClick={() => setVoidId(null)}>Cancel</GhostBtn>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: '12px', color: '#5a5a5a', marginBottom: '14px' }}>
            Recorded break: <strong>{data.break_minutes > 0 ? fmtBreakMin(data.break_minutes) : 'none'}</strong>
            {data.break_excused ? <span style={{ color: '#0c7a3a', fontWeight: 700 }}> · excused (not deducted)</span> : null}
          </div>

          <div style={{ borderTop: '1px solid #e6e6e6', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '8px' }}>Add missed scan</div>
            {blocked ? <p style={{ fontSize: '13px', color: '#b91c1c', margin: 0 }}>This day is in a locked pay period — unlock it first.</p> : (
              <>
                <p style={{ fontSize: '12px', color: '#8a8a8a', marginTop: 0 }}>
                  Adds a punch to the log, marked manual with your name and reason. Scanner punches are left untouched; the day is
                  rebuilt from scanner + manual punches together, so break and OT follow the normal rules. Times are Manila local.
                </p>
                {pinned ? (
                  <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', color: '#78350f', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                    <input type="checkbox" checked={release} onChange={e => setRelease(e.target.checked)} style={{ marginTop: '2px' }} />
                    <span>This day's {data.pinned_fields.join(' / ')} was set by hand, which overrides punches and forces break to 0. Release it so the punches count (logged).</span>
                  </label>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Time *"><TextInput type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
                  <Field label="Direction *">
                    <select value={type} onChange={e => setType(e.target.value as 'in' | 'out')} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
                      <option value="in">IN</option>
                      <option value="out">OUT</option>
                    </select>
                  </Field>
                </div>
                <Field label="Reason *"><TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Left at 4:23 PM for an errand and forgot to tap OUT — confirmed with supervisor" /></Field>
                <PrimaryBtn onClick={add} disabled={saving}>{saving ? 'Saving…' : 'Add missed scan'}</PrimaryBtn>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function HistoryModal({ api, day, onClose }: { api: Api; day: Day; onClose: () => void }) {
  const [rows, setRows] = useState<Adjustment[] | null>(null);
  useEffect(() => {
    api<Adjustment[]>(`/attendance/days/${day.id}/adjustments`).then(setRows).catch(() => setRows([]));
  }, [day.id]);
  const fieldLabel: Record<string, string> = { first_in: 'Time In', last_out: 'Time Out', status: 'Status', manual_punch: 'Manual punch', break_excused: 'Excuse Break', late_excused: 'Excuse Late', resync: 'Pins released' };
  const showVal = (field: string, v: string | null) => v === null || v === '' ? '—' : (['first_in', 'last_out'].includes(field) ? fmtTime(v) : v);
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
