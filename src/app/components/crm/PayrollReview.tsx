import { useEffect, useMemo, useState } from 'react';
import { Calculator, Search, FileSearch, Lock, Unlock, Printer, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { S, Modal, TextInput, GhostBtn, pill, peso } from './crmKit';
import { printPayslip, printPayslips } from '../../lib/payslipPrint';

// ============================================================================
// Payroll Review (Phase 4b) — shared by the Admin dashboard and the Accounting portal. Shows the
// computed payroll_lines for a LOCKED period with a complete, per-day line-by-line breakdown so
// the numbers can be checked against a real payslip before anything is trusted. Admin computes;
// Finance (accounting) views. NO payslip printing here (that is 4c).
// ============================================================================

type Api = <T = any>(path: string, init?: RequestInit) => Promise<T>;

interface Period { id: number; start_date: string; end_date: string; status: 'open' | 'locked'; payroll_finalized?: boolean; finalized_by?: string | null; finalized_at?: string | null;
  // Auto-derived (read-only) cutoff classification: 'first' cutoff of its month deducts PhilHealth/Pag-IBIG.
  cutoff_half?: 'first' | 'second'; cutoff_month?: string | null; }
// Short label for the cutoff badge, e.g. "1st cutoff · Sep" / "2nd cutoff".
const cutoffLabel = (p?: Period | null) => {
  if (!p || !p.cutoff_half) return '';
  if (p.cutoff_half === 'first') {
    const mon = p.cutoff_month ? new Date(p.cutoff_month + '-01T00:00:00').toLocaleString('en-US', { month: 'short' }) : '';
    return `1st cutoff${mon ? ' · ' + mon : ''}`;
  }
  return '2nd cutoff';
};
interface Warnings { no_pay_rate?: Array<{ person_id: number; full_name: string }>; deduction_exceeds_pay?: Array<{ person_id: number; full_name: string; shortfall: number }>; }
interface DayDetail {
  date: string; dow: number; sunday: boolean; holiday: string | null; present: boolean;
  in_min: number | null; out_min: number | null; kind: string;
  late_min?: number; counted_late_min?: number; late_excused?: boolean; excused_late_min?: number; undertime_min?: number; break_min?: number; ot_hours?: number; early_ot_hours?: number; late_ot_hours?: number;
  net_hours?: number; mult?: number; amount?: number; half_basis?: number; eligible?: boolean; prior_working_day?: string | null; note?: string;
}
interface Breakdown {
  reference: any; totals: any; deductions: any; pay: any; days: DayDetail[];
}
interface Line {
  person_id: number; full_name: string; department?: string | null; position?: string | null;
  employment_type: string; days_present: number; absent_days: number;
  base_pay: number; ot_hours: number; ot_pay: number; sunday_pay: number; holiday_pay: number;
  late_minutes: number; undertime_minutes: number; late_undertime_deduction: number;
  sss_ee: number; philhealth_ee: number; pagibig_ee: number; withholding: number; bale: number;
  gross: number; net: number; breakdown: Breakdown; computed_at: string;
}

const fmtDay = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const periodLabel = (p: Period) => `${fmtDay(p.start_date)} – ${fmtDay(p.end_date)}, ${p.start_date.slice(0, 4)}`;
const minToTime = (m: number | null) => {
  if (m === null || m === undefined) return '—';
  const h = Math.floor(m / 60), mm = m % 60; const ap = h < 12 ? 'AM' : 'PM'; const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
};
const KIND_LABEL: Record<string, string> = {
  work: 'Worked', absent: 'Absent', absent_too_late: 'Absent (too late)', sunday_worked: 'Sunday worked', sunday_off: 'Sunday (off)',
  holiday_worked: 'Holiday worked', holiday_not_worked: 'Holiday (not worked)', no_out_half: 'No OUT (½ day)',
};

export function PayrollReview({ api, role }: { api: Api; role: 'admin' | 'accounting' }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Line | null>(null);
  const [warnings, setWarnings] = useState<Warnings | null>(null);

  useEffect(() => {
    api<Period[]>('/attendance/periods').then(rows => {
      setPeriods(rows);
      const firstLocked = rows.find(r => r.status === 'locked') || rows[0];
      if (firstLocked && selectedId === null) setSelectedId(firstLocked.id);
    }).catch(() => toast.error('Failed to load pay periods'));
  }, []);

  const loadLines = async (id: number) => {
    setLoading(true);
    try {
      const r = await api<{ period: Period; lines: Line[] }>(`/payroll/periods/${id}/lines`);
      setPeriod(r.period); setLines(r.lines);
    } catch { toast.error('Failed to load payroll'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (selectedId !== null) { setWarnings(null); loadLines(selectedId); } }, [selectedId]);

  const locked = period?.status === 'locked';
  const finalized = period?.payroll_finalized === true;

  const compute = async () => {
    if (selectedId === null) return;
    setBusy(true);
    try {
      const r = await api<{ count: number; warnings?: Warnings }>(`/payroll/periods/${selectedId}/compute`, { method: 'POST' });
      await loadLines(selectedId);
      setWarnings(r.warnings || null);
      toast.success(`Computed ${r.count} payroll line${r.count === 1 ? '' : 's'}`);
    } catch (e: any) { toast.error(e.message || 'Compute failed'); } finally { setBusy(false); }
  };

  const finalize = async () => {
    if (selectedId === null) return;
    setBusy(true);
    try {
      await api(`/payroll/periods/${selectedId}/finalize`, { method: 'POST' });
      await loadLines(selectedId);
      toast.success('Payroll finalized — recompute is now locked');
    } catch (e: any) { toast.error(e.message || 'Finalize failed'); } finally { setBusy(false); }
  };
  const unfinalize = async () => {
    if (selectedId === null) return;
    setBusy(true);
    try {
      await api(`/payroll/periods/${selectedId}/unfinalize`, { method: 'POST' });
      await loadLines(selectedId);
      toast.success('Payroll un-finalized — you can recompute now');
    } catch (e: any) { toast.error(e.message || 'Un-finalize failed'); } finally { setBusy(false); }
  };

  // Print pulls straight from the loaded payroll_lines (no recompute). Both admin and accounting
  // can print. "Print all" covers everyone in the period; the per-row button prints one.
  const printOne = (l: Line) => {
    if (!period) return;
    const r = printPayslip(period, l as any);
    if (!r.ok) toast.error(r.error || 'Could not open the payslip');
  };
  const printAll = () => {
    if (!period || filtered.length === 0) return;
    const r = printPayslips(period, filtered as any);
    if (!r.ok) toast.error(r.error || 'Could not open the payslips');
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return lines.filter(l => !q || l.full_name.toLowerCase().includes(q) || (l.department || '').toLowerCase().includes(q) || (l.position || '').toLowerCase().includes(q));
  }, [lines, search]);

  const totals = useMemo(() => filtered.reduce((a, l) => ({ gross: a.gross + Number(l.gross), net: a.net + Number(l.net) }), { gross: 0, net: 0 }), [filtered]);

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={S.h1}>Payroll</h1>
          <p style={S.sub}>Computed pay per person for a locked period, with a full line-by-line breakdown to verify against a payslip. Rates and rules come from Payroll Settings and the roster. Print payslips once the numbers check out.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {lines.length > 0 && (
            <button style={{ ...S.rowBtn, padding: '9px 14px', fontWeight: 600, opacity: filtered.length === 0 ? 0.55 : 1, cursor: filtered.length === 0 ? 'default' : 'pointer' }}
              onClick={printAll} disabled={filtered.length === 0}
              title={search ? `Print the ${filtered.length} filtered payslip${filtered.length === 1 ? '' : 's'} (2 per A4 page)` : 'Print every payslip in this period (2 per A4 page)'}>
              <Printer size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Print all payslips{search && filtered.length !== lines.length ? ` (${filtered.length})` : ''}
            </button>
          )}
          {role === 'admin' && (
            <button style={{ ...S.addBtn, opacity: (!locked || busy || finalized) ? 0.55 : 1, cursor: (!locked || busy || finalized) ? 'default' : 'pointer' }}
              onClick={compute} disabled={!locked || busy || finalized}
              title={finalized ? 'Finalized — un-finalize first to recompute' : ''}>
              <Calculator size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />{busy ? 'Computing…' : 'Compute payroll'}
            </button>
          )}
          {role === 'admin' && lines.length > 0 && (
            finalized ? (
              <button style={{ ...S.rowBtn, padding: '9px 14px', fontWeight: 600, opacity: busy ? 0.55 : 1 }} onClick={unfinalize} disabled={busy}
                title="Re-open this payroll so it can be recomputed">
                <Unlock size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Un-finalize
              </button>
            ) : (
              <button style={{ ...S.rowBtn, padding: '9px 14px', fontWeight: 600, opacity: busy ? 0.55 : 1 }} onClick={finalize} disabled={busy}
                title="Lock this payroll so a later settings change can't restate it">
                <Lock size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Finalize
              </button>
            )
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: '260px' }}>
          <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
            {periods.length === 0 && <option value="">No pay periods yet</option>}
            {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)} · {cutoffLabel(p)}{p.status === 'locked' ? '  🔒' : '  (open)'}</option>)}
          </select>
        </div>
        {period && (locked ? pill('Locked', 'good') : pill('Open — lock it first', 'bad'))}
        {/* Auto-derived cutoff badge (read-only): which cutoff of its month this period is. */}
        {(() => { const sel = periods.find(p => p.id === selectedId); return sel ? pill(cutoffLabel(sel), sel.cutoff_half === 'first' ? 'good' : 'pending') : null; })()}
        {finalized && pill('Finalized', 'good')}
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8a8a8a' }} />
          <TextInput placeholder="Search name, position or department…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '34px' }} />
        </div>
      </div>

      {finalized && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '16px', borderRadius: '8px', background: '#eef7ee', border: '1px solid #b9dcb9', fontSize: '13px', color: '#2f6b2f' }}>
          <Lock size={15} /> This payroll is <strong>finalized</strong>{period?.finalized_at ? ` (${new Date(period.finalized_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })})` : ''}. Recompute is locked so a later settings change can't restate it. Un-finalize to recompute.
        </div>
      )}

      {warnings && ((warnings.no_pay_rate?.length || 0) > 0 || (warnings.deduction_exceeds_pay?.length || 0) > 0) && (
        <div style={{ padding: '12px 14px', marginBottom: '16px', borderRadius: '8px', background: '#fff8e6', border: '1px solid #e8cf8a', fontSize: '13px', color: '#7a5c0c' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '4px' }}><AlertTriangle size={15} /> Compute warnings</div>
          {(warnings.no_pay_rate?.length || 0) > 0 && (
            <div style={{ marginTop: '4px' }}>No pay rate set (skipped, not paid): {warnings.no_pay_rate!.map(p => p.full_name).join(', ')} — set a rate on the roster and recompute.</div>
          )}
          {(warnings.deduction_exceeds_pay?.length || 0) > 0 && (
            <div style={{ marginTop: '4px' }}>Deductions exceeded pay (net floored to ₱0): {warnings.deduction_exceeds_pay!.map(p => `${p.full_name} (short ${peso(p.shortfall)})`).join(', ')} — the uncollected remainder needs handling (e.g. carry the BALE forward).</div>
          )}
        </div>
      )}

      {period && !locked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '16px', borderRadius: '8px', background: '#f4f4f4', border: '1px solid #d6d6d6', fontSize: '13px', color: '#5a5a5a' }}>
          <Lock size={15} /> Payroll computes only from a locked period. Lock this period on the Attendance Sheet first.
        </div>
      )}

      <div style={{ ...S.card, overflowX: 'auto' }}>
        <table style={{ ...S.table, minWidth: '1040px' }}>
          <thead><tr>
            <th style={S.th}>Name</th><th style={S.th}>Type</th><th style={S.th}>Days</th>
            <th style={S.th}>Base</th><th style={S.th}>OT</th><th style={S.th}>Sunday</th><th style={S.th}>Holiday</th>
            <th style={S.th}>Gross</th><th style={S.th}>Deductions</th><th style={S.th}>Net</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Verify</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={S.td} colSpan={11}>Loading…</td></tr>
              : !period ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={11}>Select a pay period.</td></tr>
              : filtered.length === 0 ? <tr><td style={{ ...S.td, color: '#8a8a8a' }} colSpan={11}>{locked ? 'No payroll computed yet — click Compute payroll.' : 'Lock this period, then compute.'}</td></tr>
              : filtered.map(l => {
                const totalDed = Number(l.late_undertime_deduction) + Number(l.sss_ee) + Number(l.philhealth_ee) + Number(l.pagibig_ee) + Number(l.withholding) + Number(l.bale);
                return (
                  <tr key={l.person_id}>
                    <td style={{ ...S.td, fontWeight: 600, color: '#000' }}>{l.full_name}
                      {(l.department || l.position) ? <div style={{ fontSize: '12px', color: '#8a8a8a', fontWeight: 400 }}>{[l.department, l.position].filter(Boolean).join(' · ')}</div> : null}
                    </td>
                    <td style={S.td}>{l.employment_type === 'monthly' ? 'Monthly' : 'Daily'}</td>
                    <td style={S.td}>{l.days_present}{l.absent_days ? <span style={{ color: '#b91c1c', fontSize: '12px' }}> · {l.absent_days} abs</span> : null}</td>
                    <td style={S.td}>{peso(l.base_pay)}</td>
                    <td style={S.td}>{Number(l.ot_pay) ? <>{peso(l.ot_pay)}<div style={{ fontSize: '11px', color: '#8a8a8a' }}>{l.ot_hours}h</div></> : '—'}</td>
                    <td style={S.td}>{Number(l.sunday_pay) ? peso(l.sunday_pay) : '—'}</td>
                    <td style={S.td}>{Number(l.holiday_pay) ? peso(l.holiday_pay) : '—'}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{peso(l.gross)}</td>
                    <td style={S.td}>{peso(totalDed)}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: '#000' }}>{peso(l.net)}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button title="Print payslip" style={S.rowBtn} onClick={() => printOne(l)}><Printer size={14} /></button>
                      <button title="Line-by-line breakdown" style={{ ...S.rowBtn, marginLeft: '6px' }} onClick={() => setDetail(l)}><FileSearch size={14} /></button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot><tr>
              <td style={{ ...S.td, fontWeight: 700 }} colSpan={7}>Total ({filtered.length} {filtered.length === 1 ? 'person' : 'people'})</td>
              <td style={{ ...S.td, fontWeight: 700 }}>{peso(totals.gross)}</td>
              <td style={S.td}></td>
              <td style={{ ...S.td, fontWeight: 700, color: '#000' }}>{peso(totals.net)}</td>
              <td style={S.td}></td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {detail && <BreakdownModal line={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// Full per-person verification: reference values, per-day detail, and the deduction/pay math.
function BreakdownModal({ line, onClose }: { line: Line; onClose: () => void }) {
  const b = line.breakdown || ({} as Breakdown);
  const ref = b.reference || {};
  const ded = b.deductions || {};
  const pay = b.pay || {};
  const round2 = (n: any) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  const perMin = Number(ref.per_minute) || 0;
  // OT peso per hour = hourly × the OT multiplier (default 1.25). Used to fold each day's OT into
  // that day's Amount so the table shows the FULL take-home for the day at a glance.
  const otRate = (Number(ref.hourly) || 0) * (Number((ref.multipliers || {}).ot) || 1.25);

  // Per-day pay contribution (DISPLAY ONLY — recomputed here from the stored breakdown, never
  // changes any pay). A worked day earns its daily rate LESS that day's own late/undertime PLUS that
  // day's OT, so the Amount column shows the day's full NET pay. Half-days keep their ½-basis (net of
  // that day's late). Sunday/holiday worked show their premium amount. Off/absent → "—".
  const dayGrossBasis = (d: DayDetail): number | null => {
    if (d.kind === 'work') return Number(ref.daily_basis) || 0;
    if (d.kind === 'no_out_half') return d.amount != null ? Number(d.amount) : (Number(ref.daily_basis) || 0) / 2;
    return null;
  };
  const dayReduction = (d: DayDetail): number => {
    if (d.kind === 'work') return round2((Number(d.counted_late_min || 0) + Number(d.undertime_min || 0)) * perMin);
    if (d.kind === 'no_out_half') return round2(Number(d.counted_late_min || 0) * perMin);
    return 0;
  };
  // That day's OT in pesos (OT only ever lands on a worked day). Shown as a sub-line and folded in.
  const dayOtPay = (d: DayDetail): number => d.kind === 'work' ? round2((Number(d.ot_hours) || 0) * otRate) : 0;
  const dayAmount = (d: DayDetail): number | null => {
    if (d.kind === 'work') return round2(Math.max(0, round2((dayGrossBasis(d) || 0) - dayReduction(d))) + dayOtPay(d));
    if (d.kind === 'no_out_half') return Math.max(0, round2((dayGrossBasis(d) || 0) - dayReduction(d)));
    if (d.kind === 'sunday_worked' || d.kind === 'holiday_worked') return d.amount != null ? round2(d.amount) : null;
    if (d.kind === 'holiday_not_worked') return Number(d.amount) ? round2(d.amount) : null; // 0 (not eligible / monthly) → "—"
    return null; // absent, absent_too_late, sunday_off, not_employed
  };

  // Reconciliation ledger: the per-day amounts (net of each day's late/undertime) + overtime, less
  // the standing deductions (break, statutory, BALE), tie back to Net exactly. A residual line
  // absorbs per-minute rounding (daily) or the fixed-salary basis gap (monthly) so it always ties.
  const days = b.days || [];
  const sumDays = round2(days.reduce((a, d) => a + (dayAmount(d) || 0), 0)); // each day's amount now includes its OT
  const dBreak = round2(ded.break), dSss = round2(ded.sss_ee), dPhic = round2(ded.philhealth_ee);
  const dPgib = round2(ded.pagibig_ee), dWtax = round2(ded.withholding), dBale = round2(ded.bale);
  const reconNet = round2(sumDays - dBreak - dSss - dPhic - dPgib - dWtax - dBale);
  const residual = round2((Number(pay.net) || 0) - reconNet);
  const isMonthly = ref.employment_type === 'monthly';

  const Row = ({ k, v, strong }: { k: string; v: any; strong?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: strong ? 700 : 400, color: strong ? '#000' : '#262626', fontSize: '13px' }}>
      <span style={{ color: strong ? '#000' : '#5a5a5a' }}>{k}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#5a5a5a', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e6e6e6', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: '12.5px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' };

  return (
    <Modal title={`Payroll breakdown — ${line.full_name}`} onClose={onClose} wide
      footer={<GhostBtn onClick={onClose}>Close</GhostBtn>}>
      {/* Reference values */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '6px' }}>Reference</div>
          <Row k="Employment type" v={ref.employment_type === 'monthly' ? 'Monthly' : 'Daily'} />
          <Row k={ref.employment_type === 'monthly' ? 'Monthly salary' : 'Daily rate'} v={peso(ref.rate)} />
          <Row k="Daily basis" v={peso(ref.daily_basis)} />
          <Row k="Hourly" v={peso(ref.hourly)} />
          <Row k="Per minute" v={peso(ref.per_minute)} />
          <Row k="Paid / lunch hrs" v={`${ref.paid_hours} / ${ref.lunch_hours}`} />
          <Row k="Work hours" v={`${ref.work_start}–${ref.work_end}${ref.work_end_sat ? ` (Sat –${ref.work_end_sat})` : ''}`} />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '6px' }}>Totals</div>
          <Row k="Days present" v={b.totals?.days_present} />
          {b.totals?.half_days ? <Row k="Half days (no OUT)" v={b.totals.half_days} /> : null}
          <Row k="Absent days" v={b.totals?.absent_days} />
          <Row k="Late (raw / counted min)" v={`${b.totals?.late_minutes} / ${b.totals?.counted_late_minutes}`} />
          <Row k="Undertime (min)" v={b.totals?.undertime_minutes} />
          <Row k="OT hours (total)" v={b.totals?.ot_hours} />
          <Row k="— Early OT" v={b.totals?.early_ot_hours ?? 0} />
          <Row k="— Late OT" v={b.totals?.late_ot_hours ?? 0} />
          <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '6px' }}>Multipliers — OT {ref.multipliers?.ot} · Sun {ref.multipliers?.sunday} · Reg hol {ref.multipliers?.regular_holiday} · Spc hol {ref.multipliers?.special_holiday}</div>
          <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '3px' }}>Late-OT buffer: {ref.ot_grace_hours ?? 1}h past shift end · Early OT: no buffer (real time from IN). Both ×{ref.multipliers?.ot}.</div>
          <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '3px' }}>Special holiday not worked: {ref.special_holiday_not_worked_paid ? 'paid 1 day (eligible)' : 'no work, no pay'}</div>
        </div>
      </div>

      {/* Per-day detail */}
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '6px' }}>Per day</div>
      <div style={{ overflowX: 'auto', border: '1px solid #e6e6e6', borderRadius: '8px', marginBottom: '18px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
          <thead><tr>
            <th style={th}>Date</th><th style={th}>Type</th><th style={th}>In</th><th style={th}>Out</th>
            <th style={th}>Late</th><th style={th}>UT</th><th style={th}>OT</th><th style={th}>Amount</th><th style={th}>Note</th>
          </tr></thead>
          <tbody>
            {days.map(d => {
              const dim = d.kind === 'absent' || d.kind === 'absent_too_late' || d.kind === 'sunday_off';
              const amt = dayAmount(d);
              const red = dayReduction(d);
              return (
                <tr key={d.date} style={{ color: dim ? '#9a9a9a' : '#262626' }}>
                  <td style={td}>{fmtDay(d.date)}</td>
                  <td style={td}>{KIND_LABEL[d.kind] || d.kind}{d.holiday ? ` (${d.holiday})` : ''}</td>
                  <td style={td}>{minToTime(d.in_min)}</td>
                  <td style={td}>{minToTime(d.out_min)}</td>
                  <td style={td}>{(d.kind === 'work' || d.kind === 'no_out_half')
                    ? (d.late_excused
                        ? <span style={{ color: '#0c7a3a' }}>{d.excused_late_min || d.late_min || 0}m <span style={{ fontSize: '10.5px', fontWeight: 600 }}>excused</span></span>
                        : (d.late_min ? `${d.late_min}→${d.counted_late_min}m` : '0'))
                    : '—'}</td>
                  <td style={td}>{d.kind === 'work' ? (d.undertime_min ? `${d.undertime_min}m` : '0') : '—'}</td>
                  <td style={td}>{d.kind === 'work'
                    ? (d.ot_hours
                        ? `${d.ot_hours}h` + ((d.early_ot_hours || d.late_ot_hours) ? ` (${d.early_ot_hours || 0}e+${d.late_ot_hours || 0}l)` : '')
                        : '0')
                    : '—'}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums', fontWeight: amt != null ? 600 : 400 }}>
                    {amt != null ? peso(amt) : '—'}
                    {red > 0 ? <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 400 }}>− {peso(red)} late/UT</div> : null}
                    {dayOtPay(d) > 0 ? <div style={{ fontSize: '11px', color: '#0c7a3a', fontWeight: 400 }}>+ {peso(dayOtPay(d))} OT</div> : null}
                  </td>
                  <td style={{ ...td, color: '#8a8a8a', whiteSpace: 'normal' }}>{d.kind === 'holiday_not_worked' ? (d.eligible ? `eligible (prior ${d.prior_working_day})` : 'not eligible') : (d.break_min ? `break ${d.break_min}m docked` : (d.note || ''))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr>
            <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #e6e6e6' }} colSpan={7}>Σ Day amounts (incl. OT, net of late/UT)</td>
            <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #e6e6e6', fontVariantNumeric: 'tabular-nums' }}>{peso(sumDays)}</td>
            <td style={{ ...td, borderTop: '2px solid #e6e6e6' }}></td>
          </tr></tfoot>
        </table>
      </div>

      {/* Reconciliation: day amounts + OT, less standing deductions, tie back to Net exactly. */}
      <div style={{ marginBottom: '18px', padding: '12px 16px', background: '#fafafa', border: '1px solid #ececec', borderRadius: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '8px' }}>Reconciliation</div>
        <Row k="Σ Day amounts (incl. OT, net of late/UT)" v={peso(sumDays)} />
        {dBreak ? <Row k="− Personal break" v={`(${peso(dBreak)})`} /> : null}
        {dSss ? <Row k="− SSS (EE)" v={`(${peso(dSss)})`} /> : null}
        {dPhic ? <Row k="− PhilHealth (EE)" v={`(${peso(dPhic)})`} /> : null}
        {dPgib ? <Row k="− Pag-IBIG (EE)" v={`(${peso(dPgib)})`} /> : null}
        {dWtax ? <Row k="− Withholding" v={`(${peso(dWtax)})`} /> : null}
        {dBale ? <Row k="− BALE" v={`(${peso(dBale)})`} /> : null}
        {Math.abs(residual) >= 0.01 ? <Row k={isMonthly ? '± Monthly salary basis' : '± Rounding'} v={peso(residual)} /> : null}
        <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '4px', paddingTop: '2px' }}>
          <Row k="= Net pay" v={peso(pay.net)} strong />
        </div>
        <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '8px', marginBottom: 0 }}>
          Each worked day's Amount is its daily rate less that day's own late/undertime PLUS that day's OT (shown as a “+ OT” sub-line); half-days show their ½-basis; Sunday/holiday show their premium. {isMonthly ? 'For monthly salaries the fixed semi-monthly base is reconciled via the salary-basis line.' : 'The rounding line, if shown, is sub-peso per-minute rounding.'}
        </p>
      </div>

      {/* Pay + deductions math */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '6px' }}>Earnings</div>
          <Row k="Base pay" v={peso(pay.base)} />
          <Row k="Overtime" v={peso(pay.ot)} />
          <Row k="Sunday" v={peso(pay.sunday)} />
          <Row k="Holiday" v={peso(pay.holiday)} />
          <Row k="Gross" v={peso(pay.gross)} strong />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '6px' }}>Deductions</div>
          <Row k="Late + undertime" v={peso(ded.late_undertime)} />
          {ded.break ? <Row k={`Personal break (${b.totals?.break_minutes || 0}m)`} v={peso(ded.break)} /> : null}
          <Row k="SSS (EE)" v={peso(ded.sss_ee)} />
          <Row k="PhilHealth (EE)" v={peso(ded.philhealth_ee)} />
          <Row k="Pag-IBIG (EE)" v={peso(ded.pagibig_ee)} />
          <Row k="Withholding" v={peso(ded.withholding)} />
          <Row k="BALE" v={peso(ded.bale)} />
          <Row k="Total deductions" v={peso(ded.total)} strong />
        </div>
      </div>
      <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f7f7f7', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '15px' }}>NET PAY</span>
        <span style={{ fontWeight: 800, fontSize: '18px', fontVariantNumeric: 'tabular-nums' }}>{peso(pay.net)}</span>
      </div>
      <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '12px' }}>Computed {line.computed_at ? new Date(line.computed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : ''}. Late shows raw→counted minutes. Sunday/holiday amounts use net hours (worked span − lunch).</p>
    </Modal>
  );
}
