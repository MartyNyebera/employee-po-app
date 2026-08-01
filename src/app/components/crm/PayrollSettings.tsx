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
  'work_start', 'work_end', 'work_end_sat', 'paid_hours', 'lunch_hours', 'monthly_divisor', 'grace_minutes',
  'tardy_mid_deduct_minutes', 'tardy_max_start_minutes', 'tardy_max_deduct_minutes',
  'ot_multiplier', 'sunday_multiplier', 'regular_holiday_multiplier', 'special_holiday_multiplier',
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

  // Live description of the tardiness ladder from the current values.
  const grace = Number(f.grace_minutes) || 0;
  const midDed = Number(f.tardy_mid_deduct_minutes) || 0;
  const maxStart = Number(f.tardy_max_start_minutes) || 0;
  const maxDed = Number(f.tardy_max_deduct_minutes) || 0;
  const ladder = `1–${grace} min → 0 · ${grace + 1}–${Math.max(grace + 1, maxStart - 1)} min → ${midDed} min · ≥${maxStart} min → ${maxDed} min (cap)`;

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
        </div>
        <div style={{ fontSize: '12px', color: '#5a5a5a', marginTop: '10px', padding: '8px 12px', background: '#f7f7f7', borderRadius: '8px' }}>
          Saturday is a full working day at the full daily rate — it just ends earlier. Late is always measured from the start time; undertime and OT on Saturdays use the Saturday end.
        </div>
      </Group>

      <Group title="Pay basis">
        <div style={grid(4)}>
          <NumField label="Monthly divisor" hint="Days used to derive a daily rate from a monthly salary." value={f.monthly_divisor} onChange={v => set('monthly_divisor', v)} />
        </div>
      </Group>

      <Group title="Tardiness">
        <div style={grid(4)}>
          <NumField label="Grace period (min)" hint="No deduction up to here." value={f.grace_minutes} onChange={v => set('grace_minutes', v)} />
          <NumField label="Deduction past grace (min)" value={f.tardy_mid_deduct_minutes} onChange={v => set('tardy_mid_deduct_minutes', v)} />
          <NumField label="Heavy-late threshold (min)" value={f.tardy_max_start_minutes} onChange={v => set('tardy_max_start_minutes', v)} />
          <NumField label="Heavy-late deduction (min, cap)" value={f.tardy_max_deduct_minutes} onChange={v => set('tardy_max_deduct_minutes', v)} />
        </div>
        <div style={{ fontSize: '12px', color: '#5a5a5a', marginTop: '12px', padding: '10px 12px', background: '#f7f7f7', borderRadius: '8px' }}>
          Ladder: {ladder}
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
