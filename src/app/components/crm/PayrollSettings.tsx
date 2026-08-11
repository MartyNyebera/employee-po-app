import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../api/client';
import { S, TextInput, PrimaryBtn } from './crmKit';

// ============================================================================
// Payroll Settings (Phase 4a) — admin-only editable company policy. Every rate/rule the payroll
// run will use lives here so nothing is hardcoded and policy changes need no code change. This
// screen only VIEWS/EDITS the values — no pay is computed here.
// ============================================================================

// All values arrive as strings (Postgres NUMERIC) or numbers; the form keeps them as strings.
type Settings = Record<string, string>;

const FIELD_ORDER = [
  'work_start', 'work_end', 'work_end_sat', 'paid_hours', 'lunch_hours', 'lunch_start', 'lunch_end', 'monthly_divisor',
  'late_grace_minutes', 'late_tier1_minutes', 'late_cutoff_minutes', 'late_absent_buffer_minutes',
  'ot_multiplier', 'ot_grace_hours', 'sunday_multiplier', 'regular_holiday_multiplier', 'special_holiday_multiplier',
];

const toForm = (s: any): Settings => {
  const f: Settings = {};
  for (const k of FIELD_ORDER) f[k] = s?.[k] === null || s?.[k] === undefined ? '' : String(s[k]);
  f.special_holiday_not_worked_paid = s?.special_holiday_not_worked_paid ? 'true' : 'false';
  return f;
};

// Reserve two lines of height for every field label so a label that wraps (e.g. "Heavy-late
// deduction (min, cap)") doesn't push its input below the others in the same row. All inputs in a
// row then start at the same y regardless of how many lines each label takes.
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: '#262626', marginBottom: '5px',
  lineHeight: '15px', minHeight: '30px',
};

function NumField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <TextInput type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} />
      {hint ? <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '4px' }}>{hint}</div> : null}
    </div>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ ...S.card, padding: '20px', marginBottom: '18px' }}>
    <div style={{ fontSize: '13px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>{title}</div>
    {children}
  </div>
);
const grid = (cols: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px' });

export function PayrollSettings() {
  const [f, setF] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => (p ? { ...p, [k]: v } : p));

  useEffect(() => {
    fetchApi<any>('/payroll/settings').then(s => setF(toForm(s))).catch(() => toast.error('Failed to load payroll settings'));
  }, []);

  const save = async () => {
    if (!f) return;
    setSaving(true);
    try {
      const body = { ...f, special_holiday_not_worked_paid: f.special_holiday_not_worked_paid === 'true' };
      const saved = await fetchApi<any>('/payroll/settings', { method: 'PUT', body: JSON.stringify(body) });
      setF(toForm(saved));
      toast.success('Payroll settings saved');
    } catch (e: any) { toast.error(e.message || 'Save failed'); } finally { setSaving(false); }
  };

  if (!f) return <div style={S.page}><p style={S.sub}>Loading…</p></div>;

  // Live description of the late ladder (v2) from the current values. Deduction minutes = the
  // scan-in rounded UP to a mark, measured from the start time; no cap.
  const start = f.work_start || '08:00';
  const grace = Number(f.late_grace_minutes) || 0;
  const tier1 = Number(f.late_tier1_minutes) || 0;
  const cutoff = Number(f.late_cutoff_minutes) || 0;
  const absentBuf = Number(f.late_absent_buffer_minutes) || 0;
  const startMin = (() => { const [h, m] = start.split(':').map(Number); return (h || 0) * 60 + (m || 0); })();
  const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(((mins % 60) + 60) % 60).padStart(2, '0')}`;
  const ladder = `In by ${hhmm(startMin + grace)} → 0 · to ${hhmm(startMin + tier1)} → ${tier1} min · to ${hhmm(startMin + cutoff)} → ${cutoff} min · after that the scan-in rounds UP to the next :15 / :30 / :00 mark (no :45; :31–:00 jumps to the next hour) and the deduction is (rounded-in − start), no cap`;

  return (
    <div style={{ ...S.page, maxWidth: '860px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={S.h1}>Payroll Settings</h1>
          <p style={S.sub}>Company-policy rates and rules the payroll run reads. Change them here anytime — no code change needed. Nothing computes pay on this screen.</p>
        </div>
        <button style={S.addBtn} onClick={save} disabled={saving}><Save size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <Group title="Work schedule">
        <div style={grid(4)}>
          <div>
            <div style={labelStyle}>Start</div>
            <TextInput type="time" value={f.work_start} onChange={e => set('work_start', e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>End (Mon–Fri)</div>
            <TextInput type="time" value={f.work_end} onChange={e => set('work_end', e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>End (Saturday)</div>
            <TextInput type="time" value={f.work_end_sat} onChange={e => set('work_end_sat', e.target.value)} />
          </div>
          <NumField label="Paid hours" value={f.paid_hours} onChange={v => set('paid_hours', v)} />
          <NumField label="Lunch hours" value={f.lunch_hours} onChange={v => set('lunch_hours', v)} />
          <div>
            <div style={labelStyle}>Lunch start</div>
            <TextInput type="time" value={f.lunch_start} onChange={e => set('lunch_start', e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>Lunch end</div>
            <TextInput type="time" value={f.lunch_end} onChange={e => set('lunch_end', e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: '12px', color: '#5a5a5a', marginTop: '10px', padding: '8px 12px', background: '#f7f7f7', borderRadius: '8px' }}>
          Saturday is a full working day at the full daily rate — it just ends earlier. Late is always measured from the start time; undertime and OT on Saturdays use the Saturday end. The lunch window is free time for mid-day personal-business breaks (see below).
        </div>
      </Group>

      <Group title="Pay basis">
        <div style={grid(4)}>
          <NumField label="Monthly divisor" hint="Days used to derive a daily rate from a monthly salary." value={f.monthly_divisor} onChange={v => set('monthly_divisor', v)} />
        </div>
      </Group>

      <Group title="Tardiness">
        <div style={grid(4)}>
          <NumField label="Grace period (min)" hint="No deduction up to here." value={f.late_grace_minutes} onChange={v => set('late_grace_minutes', v)} />
          <NumField label="First mark (min)" hint="Past grace up to here → this many minutes." value={f.late_tier1_minutes} onChange={v => set('late_tier1_minutes', v)} />
          <NumField label="Cutoff mark (min)" hint="Up to here → this many minutes. Past this, the shared :15/:30/:00 round-up applies (no cap)." value={f.late_cutoff_minutes} onChange={v => set('late_cutoff_minutes', v)} />
          <NumField label="Absent buffer before end (min)" hint="Clock-in later than (shift end − this) → the day is ABSENT (₱0). Default 60 = weekday 16:00, Saturday 15:00." value={f.late_absent_buffer_minutes} onChange={v => set('late_absent_buffer_minutes', v)} />
        </div>
        <div style={{ fontSize: '12px', color: '#5a5a5a', marginTop: '12px', padding: '10px 12px', background: '#f7f7f7', borderRadius: '8px' }}>
          {ladder}. Each late minute is charged at the per-minute rate (daily ÷ paid hours ÷ 60). A clock-in more than {absentBuf} minutes before shift end makes the whole day absent.
        </div>
      </Group>

      <Group title="Mid-day personal-business break">
        <div style={{ fontSize: '12px', color: '#5a5a5a', padding: '10px 12px', background: '#f7f7f7', borderRadius: '8px' }}>
          Employees may tap OUT and back IN for a personal errand mid-day (multi-tap: first tap = IN, then alternating; the first IN opens the day and the last OUT closes it). Each middle OUT→IN gap is an unpaid break, docked from the break-out time to the return rounded UP with the same :15 / :30 / :00 rule (e.g. back 11:25 → 11:30 → 90 min if out at 10:00). The lunch window ({f.lunch_start || '12:00'}–{f.lunch_end || '13:00'}) is free: a break running into lunch docks only up to lunch start, and a late return after lunch is docked from lunch end using the same rounding. Docked minutes × per-minute rate, folded into the day's deduction. A normal two-tap day is unaffected.
        </div>
      </Group>

      <Group title="Premium multipliers">
        <div style={grid(4)}>
          <NumField label="Overtime ×" value={f.ot_multiplier} onChange={v => set('ot_multiplier', v)} />
          <NumField label="Sunday ×" value={f.sunday_multiplier} onChange={v => set('sunday_multiplier', v)} />
          <NumField label="Regular holiday ×" value={f.regular_holiday_multiplier} onChange={v => set('regular_holiday_multiplier', v)} />
          <NumField label="Special holiday ×" value={f.special_holiday_multiplier} onChange={v => set('special_holiday_multiplier', v)} />
        </div>
      </Group>

      <Group title="Overtime buffer">
        <div style={grid(4)}>
          <NumField label="Late-OT buffer (hours)" hint="Minimum time past shift end before after-shift OT counts (default 1). Once past it, ALL time past shift end is paid OT."
            value={f.ot_grace_hours} onChange={v => set('ot_grace_hours', v)} />
        </div>
        <div style={{ fontSize: '12px', color: '#5a5a5a', marginTop: '10px', padding: '8px 12px', background: '#f7f7f7', borderRadius: '8px' }}>
          Applies to LATE (after-shift) OT only. EARLY OT (coming in before the start time) has no buffer — it pays the actual time from the real IN to the shift start. Both require the person to be OT-eligible and the matching per-day OT toggle approved on the attendance sheet.
        </div>
      </Group>

      <Group title="Holiday policy">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={f.special_holiday_not_worked_paid === 'true'}
            onChange={e => set('special_holiday_not_worked_paid', e.target.checked ? 'true' : 'false')}
            style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }} />
          <span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#262626' }}>Pay special holiday when not worked</span>
            <span style={{ display: 'block', fontSize: '12px', color: '#8a8a8a', marginTop: '3px' }}>
              Off (default) = DOLE “no work, no pay” — an unworked special holiday pays ₱0. On = eligible people (present the working day before) get one day’s pay, like a regular holiday. Regular holidays and all worked holidays are unaffected.
            </span>
          </span>
        </label>
      </Group>
    </div>
  );
}
