// ============================================================================
// 13th Month Pay calculator (Payroll area). Everything on this screen is worked out by the server
// (GET /api/payroll/thirteenth-month) in whole centavos from payroll lines that already exist; this file
// formats it. Basic earned = base pay - late/undertime - personal-break deductions (no OT, Sunday or
// holiday premiums). Due = (basic in system + basic before system) / 12. Posting writes "13th Month Pay"
// earning adjustments into a pay period (the payroll adjustment lines), and the server re-checks every
// balance inside the transaction, so a second post can only ever pay what is still owed.
// `isAdmin` is required: a read-only caller gets the figures and Export but no edit and no Post.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Pencil, Send } from 'lucide-react';
import { toast } from 'sonner';
import { S, Modal, Field, TextInput, PrimaryBtn, GhostBtn, TableScroll, tightTh, tightTd, peso, pill } from './crmKit';
import { downloadXlsx } from '../../lib/reportExport';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

interface PeriodCounted { id: number; start: string; end: string; finalized: boolean; basic: string }
interface Row {
  personId: number; fullName: string; status: string; hiredOn: string | null; lastDay: string | null;
  basicInSystem: string; periodsCounted: PeriodCounted[]; basicBeforeSystem: string; priorNotes: string | null;
  dueBasis: string; due: string; alreadyPaid: string; balance: string;
}
interface Data {
  year: number; rows: Row[];
  totals: { basicInSystem: string; basicBeforeSystem: string; due: string; alreadyPaid: string; balance: string };
  periods: { id: number; start: string; end: string; status: string; finalized: boolean; lines: number }[];
  notFinalized: { id: number; start: string; end: string; status: string; lines: number }[];
  postable: { id: number; start: string; end: string; status: string }[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (ymd: string) => MON[Number(ymd.slice(5, 7)) - 1] + ' ' + Number(ymd.slice(8, 10));
const rangeLabel = (a: string, b: string) => md(a) + ' – ' + md(b) + ', ' + b.slice(0, 4);

export function ThirteenthMonth({ api, isAdmin, onBack }: { api: Api; isAdmin: boolean; onBack?: () => void }) {
  const thisYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const [posting, setPosting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api<Data>('/payroll/thirteenth-month?year=' + year);
      setData(d);
      // Default selection: everyone who is actually owed something.
      setSelected(new Set(d.rows.filter(r => Number(r.balance) > 0).map(r => r.personId)));
    } catch (e: any) { toast.error(e.message || 'Could not load the 13th month figures'); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const r = await downloadXlsx(api, '/payroll/thirteenth-month/export?year=' + year);
      toast.success('Exported ' + r.rowCount + ' ' + (r.rowCount === 1 ? 'employee' : 'employees') + ' — ' + r.filename);
    } catch (e: any) { toast.error(e.message || 'Export failed'); } finally { setExporting(false); }
  };

  const toggle = (id: number) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = data?.rows ?? [];
  const chosen = useMemo(() => rows.filter(r => selected.has(r.personId)), [rows, selected]);
  const num = { textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties;
  const foot = { background: '#f7f7f7', fontWeight: 700 } as React.CSSProperties;
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];

  return (
    <div style={onBack ? { padding: 0 } : S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h1 style={S.h1}>13th Month Pay</h1>
          <p style={S.sub}>
            Basic earned (base pay − late/undertime − personal break; no OT, Sunday or holiday premiums) in the system plus any earned before it, ÷ 12.
            A pay period counts toward the year its end date falls in.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {onBack && <button style={{ ...S.rowBtn, marginLeft: 0, padding: '9px 14px' }} onClick={onBack}>← Payroll</button>}
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...S.input, width: 'auto', cursor: 'pointer' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button style={{ ...S.rowBtn, marginLeft: 0, padding: '9px 14px', fontWeight: 600, opacity: exporting || !data ? 0.55 : 1 }} disabled={exporting || !data} onClick={exportXlsx}>
            <Download size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />{exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          {isAdmin && (
            <button style={{ ...S.addBtn, opacity: chosen.length === 0 ? 0.55 : 1 }} disabled={chosen.length === 0} onClick={() => setPosting(true)}>
              <Send size={14} style={{ marginRight: '6px' }} />Post to payroll{chosen.length ? ' (' + chosen.length + ')' : ''}
            </button>
          )}
        </div>
      </div>

      {data && data.notFinalized.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', marginBottom: '14px', borderRadius: '8px', background: '#fff8e6', border: '1px solid #e8cf8a', fontSize: '13px', color: '#7a5c0c' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <b>{data.notFinalized.length} pay period{data.notFinalized.length === 1 ? '' : 's'} of {data.year} {data.notFinalized.length === 1 ? 'is' : 'are'} not finalized</b> — these figures are provisional until they are:{' '}
            {data.notFinalized.map(p => '#' + p.id + ' (' + rangeLabel(p.start, p.end) + ', ' + (p.lines ? p.status + ', ' + p.lines + ' lines' : 'no pay computed yet') + ')').join('; ')}.
            <div style={{ marginTop: '3px' }}>Only pay periods that already exist in the system are counted.</div>
          </div>
        </div>
      )}

      {loading && !data ? <div style={{ color: '#8a8a8a', fontSize: '14px', padding: '30px 0' }}>Loading…</div> : (
        <TableScroll>
          <table style={S.table}>
            <thead><tr>
              {isAdmin && <th style={{ ...tightTh, width: '28px' }}></th>}
              <th style={tightTh}>Employee</th>
              <th style={tightTh}>Periods counted</th>
              <th style={{ ...tightTh, textAlign: 'right' }}>Basic in system</th>
              <th style={{ ...tightTh, textAlign: 'right' }}>Basic before system</th>
              <th style={{ ...tightTh, textAlign: 'right' }}>13th month due</th>
              <th style={{ ...tightTh, textAlign: 'right' }}>Already paid</th>
              <th style={{ ...tightTh, textAlign: 'right', paddingRight: '16px' }}>Balance to pay</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={isAdmin ? 8 : 7}>No employees with pay in {year}.</td></tr>
              ) : rows.map(r => {
                const owed = Number(r.balance) > 0;
                return (
                  <tr key={r.personId}>
                    {isAdmin && <td style={tightTd}><input type="checkbox" checked={selected.has(r.personId)} onChange={() => toggle(r.personId)} title={owed ? 'Include in Post' : 'Nothing to post for this employee'} /></td>}
                    <td style={{ ...tightTd, whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {r.fullName}{r.status === 'resigned' || r.lastDay ? <span style={{ marginLeft: '8px' }}>{pill('Resigned' + (r.lastDay ? ' ' + md(r.lastDay) : ''), 'pending')}</span> : null}
                    </td>
                    <td style={{ ...tightTd, whiteSpace: 'nowrap', color: '#5a5a5a' }} title={r.periodsCounted.map(p => '#' + p.id + ' ' + rangeLabel(p.start, p.end) + ' — ' + peso(Number(p.basic)) + (p.finalized ? '' : ' (not finalized)')).join('\n')}>
                      {r.periodsCounted.length === 0 ? '—' : r.periodsCounted.length + ' period' + (r.periodsCounted.length === 1 ? '' : 's') + ': ' + r.periodsCounted.map(p => '#' + p.id).join(' ')}
                    </td>
                    <td style={{ ...tightTd, ...num }}>{peso(Number(r.basicInSystem))}</td>
                    <td style={{ ...tightTd, ...num }}>
                      {peso(Number(r.basicBeforeSystem))}
                      {isAdmin && <button title="Edit earnings paid before the system" style={{ ...S.rowBtn, marginLeft: '6px', padding: '3px 6px' }} onClick={() => setEditing(r)}><Pencil size={12} /></button>}
                    </td>
                    <td style={{ ...tightTd, ...num, fontWeight: 600 }}>{peso(Number(r.due))}</td>
                    <td style={{ ...tightTd, ...num, color: Number(r.alreadyPaid) > 0 ? '#15803d' : '#8a8a8a' }}>{peso(Number(r.alreadyPaid))}</td>
                    <td style={{ ...tightTd, ...num, fontWeight: 700, paddingRight: '16px', color: Number(r.balance) < 0 ? '#b45309' : owed ? '#000' : '#8a8a8a' }}
                      title={Number(r.balance) < 0 ? 'Paid more than due' : undefined}>{peso(Number(r.balance))}</td>
                  </tr>
                );
              })}
            </tbody>
            {data && rows.length > 0 && (
              <tfoot><tr>
                <td style={{ ...tightTd, ...foot }} colSpan={isAdmin ? 3 : 2}>Total — {rows.length} employee{rows.length === 1 ? '' : 's'}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data.totals.basicInSystem))}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data.totals.basicBeforeSystem))}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data.totals.due))}</td>
                <td style={{ ...tightTd, ...foot, ...num }}>{peso(Number(data.totals.alreadyPaid))}</td>
                <td style={{ ...tightTd, ...foot, ...num, paddingRight: '16px' }}>{peso(Number(data.totals.balance))}</td>
              </tr></tfoot>
            )}
          </table>
        </TableScroll>
      )}

      {editing && <PriorModal api={api} year={year} row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {posting && data && (
        <PostModal api={api} data={data} chosen={chosen} onClose={() => setPosting(false)} onPosted={() => { setPosting(false); load(); }} />
      )}
    </div>
  );
}

function PriorModal({ api, year, row, onClose, onSaved }: { api: Api; year: number; row: Row; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(row.basicBeforeSystem === '0.00' ? '' : row.basicBeforeSystem);
  const [notes, setNotes] = useState(row.priorNotes ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api('/payroll/thirteenth-month/prior', { method: 'PUT', body: JSON.stringify({ personId: row.personId, year, amount: amount.trim() || '0', notes }) });
      toast.success('Saved'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <Modal title={'Earned before the system — ' + row.fullName + ', ' + year} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryBtn></>}>
      <p style={{ fontSize: '12px', color: '#5a5a5a', marginTop: 0 }}>Basic pay for {year} that was paid outside the system (before it was used). It is added to the in-system basic before dividing by 12. Every change is logged.</p>
      <Field label="Basic earned before the system"><TextInput value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
      <Field label="Notes"><TextInput value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Jan–Jul 2026 paid by hand" /></Field>
    </Modal>
  );
}

function PostModal({ api, data, chosen, onClose, onPosted }: { api: Api; data: Data; chosen: Row[]; onClose: () => void; onPosted: () => void }) {
  const [periodId, setPeriodId] = useState<string>(data.postable[0] ? String(data.postable[0].id) : '');
  const [busy, setBusy] = useState(false);
  const payable = chosen.filter(r => Number(r.balance) > 0);
  const skipped = chosen.filter(r => Number(r.balance) <= 0);
  const total = payable.reduce((n, r) => n + Math.round(Number(r.balance) * 100), 0) / 100;
  const post = async () => {
    if (!periodId) { toast.error('Pick the pay period to post into'); return; }
    setBusy(true);
    try {
      const r = await api<{ posted: unknown[]; skipped: unknown[] }>('/payroll/thirteenth-month/post', { method: 'POST', body: JSON.stringify({ year: data.year, periodId: Number(periodId), personIds: payable.map(x => x.personId) }) });
      toast.success('Posted ' + r.posted.length + ' adjustment' + (r.posted.length === 1 ? '' : 's') + (r.skipped.length ? ' (' + r.skipped.length + ' skipped)' : '') + ' — recompute that period to apply them');
      onPosted();
    } catch (e: any) { toast.error(e.message || 'Could not post'); } finally { setBusy(false); }
  };
  return (
    <Modal title={'Post 13th month ' + data.year + ' to payroll'} onClose={onClose} wide
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={post} disabled={busy || payable.length === 0}>{busy ? 'Posting…' : 'Post ' + payable.length + ' adjustment' + (payable.length === 1 ? '' : 's')}</PrimaryBtn></>}>
      <Field label="Post into pay period *">
        <select value={periodId} onChange={e => setPeriodId(e.target.value)} style={{ ...S.input, appearance: 'none', cursor: 'pointer' }}>
          {data.postable.length === 0 && <option value="">No open period — create one first</option>}
          {data.postable.map(p => <option key={p.id} value={p.id}>{rangeLabel(p.start, p.end)} · {p.status}</option>)}
        </select>
      </Field>
      {data.notFinalized.length > 0 && (
        <p style={{ fontSize: '12px', color: '#7a5c0c', background: '#fff8e6', border: '1px solid #e8cf8a', borderRadius: '8px', padding: '8px 10px' }}>
          <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {data.notFinalized.length} pay period{data.notFinalized.length === 1 ? '' : 's'} of {data.year} {data.notFinalized.length === 1 ? 'is' : 'are'} not finalized, so these balances are provisional.
        </p>
      )}
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#7a6a0c', margin: '10px 0 4px' }}>Review — each becomes a “13th Month Pay” earning, reason “13th month {data.year}”</div>
      <div style={{ border: '1px solid #e6e6e6', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {payable.map(r => <tr key={r.personId}><td style={{ padding: '6px 10px', fontSize: '13px', borderBottom: '1px solid #f0f0f0' }}>{r.fullName}</td><td style={{ padding: '6px 10px', fontSize: '13px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>{peso(Number(r.balance))}</td></tr>)}
            {skipped.map(r => <tr key={r.personId} style={{ color: '#8a8a8a' }}><td style={{ padding: '6px 10px', fontSize: '13px', borderBottom: '1px solid #f0f0f0' }}>{r.fullName}</td><td style={{ padding: '6px 10px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>skipped — {Number(r.balance) === 0 ? 'nothing left to pay' : 'already paid more than due'}</td></tr>)}
            <tr style={{ background: '#f7f7f7', fontWeight: 700 }}><td style={{ padding: '7px 10px', fontSize: '13px' }}>Total to post</td><td style={{ padding: '7px 10px', fontSize: '13px', textAlign: 'right' }}>{peso(total)}</td></tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '11px', color: '#8a8a8a' }}>Zero or negative balances are never posted. Balances are re-checked when you press Post, so posting twice only pays what is still owed. Recompute the period afterwards to apply them.</p>
    </Modal>
  );
}
