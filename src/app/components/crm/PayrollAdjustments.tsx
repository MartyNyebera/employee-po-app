// Payroll adjustment lines for one pay period: one-off earnings (13th month, back pay, bonus) and
// deductions. Lives beside Payroll Review. Adding or voiding changes NOTHING in the computed lines
// until the period is recomputed -- the engine reads them from their own table on every compute -- so
// the screen says so. A finalized period is read-only (the server refuses with 409 too), and a
// read-only caller (canEdit = false) sees the list but no add form and no void.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal, Field, TextInput, TextArea, PrimaryBtn, GhostBtn, S, peso } from './crmKit';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

interface Adjustment {
  id: number; personId: number; personName: string | null; kind: 'earning' | 'deduction'; label: string; amount: string;
  reason: string; createdBy: string | null; createdAt: string; voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
}
interface Person { id: number; fullName: string; lastDay: string | null }

export function PayrollAdjustmentsModal({ api, periodId, finalized, canEdit, presetPersonId, onClose, onChanged }: {
  api: Api; periodId: number; finalized: boolean; canEdit: boolean;
  /** Opened from a row: that employee is pre-selected. */
  presetPersonId: number | null;
  onClose: () => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<Adjustment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [personId, setPersonId] = useState<string>(presetPersonId ? String(presetPersonId) : '');
  const [kind, setKind] = useState<'earning' | 'deduction'>('earning');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidId, setVoidId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const r = await api<{ adjustments: Adjustment[]; people: Person[] }>('/payroll/periods/' + periodId + '/adjustments');
      setItems(r.adjustments); setPeople(r.people);
    } catch (e: any) { toast.error(e.message || 'Could not load the adjustments'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodId]);

  const editable = canEdit && !finalized;
  const shown = presetPersonId ? items.filter(a => a.personId === presetPersonId) : items;

  const add = async () => {
    setError('');
    if (!personId) { setError('Pick the employee'); return; }
    if (!label.trim()) { setError('Enter a label, e.g. 13th Month Pay'); return; }
    if (!amount.trim()) { setError('Enter the amount'); return; }
    if (!reason.trim()) { setError('A reason is required'); return; }
    setSaving(true);
    try {
      const r = await api<{ adjustments: Adjustment[] }>('/payroll/periods/' + periodId + '/adjustments', {
        method: 'POST', body: JSON.stringify({ personId: Number(personId), kind, label, amount, reason }) });
      setItems(r.adjustments); setLabel(''); setAmount(''); setReason('');
      toast.success('Adjustment added — recompute the period to apply it'); onChanged();
    } catch (e: any) { setError(e.message || 'Could not add the adjustment'); } finally { setSaving(false); }
  };

  const doVoid = async () => {
    if (voidId === null) return;
    if (!voidReason.trim()) { setError('A reason is required to void an adjustment'); return; }
    setSaving(true); setError('');
    try {
      const r = await api<{ adjustments: Adjustment[] }>('/payroll/adjustments/' + voidId + '/void', { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      setItems(r.adjustments); setVoidId(null); setVoidReason('');
      toast.success('Adjustment voided — recompute the period to apply it'); onChanged();
    } catch (e: any) { setError(e.message || 'Could not void the adjustment'); } finally { setSaving(false); }
  };

  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#5a5a5a', textTransform: 'uppercase', borderBottom: '1px solid #e6e6e6', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: '12.5px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' };

  return (
    <Modal title={presetPersonId ? 'Adjustments — ' + (people.find(p => p.id === presetPersonId)?.fullName || '') : 'Payroll adjustments'} onClose={onClose} wide
      footer={<GhostBtn onClick={onClose}>Close</GhostBtn>}>
      <p style={{ fontSize: '12px', color: '#5a5a5a', marginTop: 0 }}>
        One-off earnings (13th month, back pay, bonus) and deductions. They are added <b>after</b> the statutory deductions, which are still worked out on attendance pay only.
        Changes here take effect when the period is <b>recomputed</b>.
        {finalized ? <b style={{ color: '#b45309' }}> This payroll is finalized — un-finalize it to add or void an adjustment.</b> : null}
      </p>

      {loading ? <p style={{ color: '#8a8a8a' }}>Loading…</p> : (
        <div style={{ overflowX: 'auto', border: '1px solid #e6e6e6', borderRadius: '8px', marginBottom: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
            <thead><tr>
              {!presetPersonId && <th style={th}>Employee</th>}
              <th style={th}>Type</th><th style={th}>Label</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Reason</th><th style={th}>By</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td style={{ ...td, color: '#8a8a8a' }} colSpan={presetPersonId ? 6 : 7}>No adjustments for this period.</td></tr> : shown.map(a => {
                const v = !!a.voidedAt;
                return (
                  <tr key={a.id} style={v ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                    {!presetPersonId && <td style={td}>{a.personName}</td>}
                    <td style={{ ...td, color: a.kind === 'earning' ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>{a.kind === 'earning' ? 'Earning' : 'Deduction'}</td>
                    <td style={td}>{a.label}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{peso(Number(a.amount))}</td>
                    <td style={{ ...td, maxWidth: '220px' }} title={v ? ('Voided: ' + (a.voidReason || '')) : a.reason}>{a.reason}{v ? <div style={{ fontSize: '11px', color: '#b91c1c', textDecoration: 'none' }}>voided: {a.voidReason}</div> : null}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#8a8a8a' }}>{a.createdBy || '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {editable && !v ? <button style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} onClick={() => { setVoidId(a.id); setVoidReason(''); setError(''); }}>Void</button> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {voidId !== null && (
        <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
          <Field label="Reason for voiding *"><TextInput value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Entered for the wrong employee" /></Field>
          <div style={{ display: 'flex', gap: '8px' }}>
            <PrimaryBtn onClick={doVoid} disabled={saving}>{saving ? 'Voiding…' : 'Void adjustment'}</PrimaryBtn>
            <GhostBtn onClick={() => setVoidId(null)}>Cancel</GhostBtn>
          </div>
        </div>
      )}

      {editable && (
        <div style={{ borderTop: '1px solid #e6e6e6', paddingTop: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7a6a0c', marginBottom: '8px' }}>Add adjustment</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0 14px' }}>
            <Field label="Employee *">
              <select value={personId} onChange={e => setPersonId(e.target.value)} disabled={!!presetPersonId} style={{ ...S.input, appearance: 'none', cursor: presetPersonId ? 'default' : 'pointer' }}>
                <option value="">Select an employee…</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.fullName}{p.lastDay ? ' (left ' + p.lastDay + ')' : ''}</option>)}
              </select>
            </Field>
            <Field label="Type *">
              <select value={kind} onChange={e => setKind(e.target.value as 'earning' | 'deduction')} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
                <option value="earning">Earning (adds to pay)</option>
                <option value="deduction">Deduction (reduces pay)</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0 14px' }}>
            <Field label="Label *"><TextInput value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. 13th Month Pay, Back pay Oct 12, Bonus" list="adj-label-presets" /></Field>
            <Field label="Amount *"><TextInput value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
          </div>
          <datalist id="adj-label-presets"><option value="13th Month Pay" /><option value="Back pay" /><option value="Bonus" /></datalist>
          <Field label="Reason *"><TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being paid / deducted?" /></Field>
          {error && <p style={{ fontSize: '12.5px', color: '#b91c1c', margin: '0 0 8px' }}>{error}</p>}
          <PrimaryBtn onClick={add} disabled={saving}>{saving ? 'Saving…' : 'Add adjustment'}</PrimaryBtn>
        </div>
      )}
      {!editable && error && <p style={{ fontSize: '12.5px', color: '#b91c1c' }}>{error}</p>}
    </Modal>
  );
}
