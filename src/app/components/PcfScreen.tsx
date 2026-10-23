// ============================================================================
// PCF -- Petty Cash Fund (imprest). Spending the fund is an ordinary Disbursement Voucher whose payment
// mode is "Petty cash"; a replenishment is money INTO the fund and is never an expense. Everything on
// this screen -- the four cards (Fund amount + Additional amount - Spent = Current balance), every ledger
// line and its running balance -- is derived and summed by
// GET /api/pcf in whole centavos on each read; this file only formats it, so the last ledger balance
// and the Current balance card are the same number by construction. A negative balance is allowed and
// shown amber. `isAdmin` is the caller's "may manage" answer (required, like the other accounting
// screens): a read-only caller gets the cards, the ledger and Export, but no settings or replenishment.
// ============================================================================
import { useEffect, useState } from 'react';
import { Download, Plus, Settings, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { S, TableScroll, tightTh, tightTd, peso, shortDate, oneLine, Modal, Field, TextInput, PrimaryBtn, GhostBtn } from './crm/crmKit';
import { downloadXlsx, manilaMonth, qsOf } from '../lib/reportExport';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

interface Settings { custodian: string; fundAmount: string; openingDate: string; updatedBy: string | null }
interface LedgerLine {
  kind: 'replenishment' | 'voucher'; id: number; date: string; ref: string; description: string;
  /** Signed: positive for an additional amount, negative for a petty cash voucher. */
  amount: string; balance: string;
}
interface PcfData {
  configured: boolean; settings: Settings | null;
  cards?: { fundAmount: string; additionalAmount: string; spent: string; balance: string; balanceNegative: boolean };
  ledger?: LedgerLine[]; totals?: { net: string; count: number }; voidedExcluded?: number;
  settingsLog?: { at: string; by: string | null; field: string; from: string | null; to: string }[];
}

const FIELD_LABEL: Record<string, string> = { custodian: 'Custodian', fund_amount: 'Fund amount', opening_date: 'Opening date' };
const AMBER = '#b45309';

export function PcfScreen({ api, isAdmin }: { api: Api; isAdmin: boolean }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<PcfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replOpen, setReplOpen] = useState(false);
  const [voidFor, setVoidFor] = useState<LedgerLine | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await api<PcfData>(`/pcf${qsOf({ from, to })}`)); }
    catch (e: any) { toast.error(e.message || 'Failed to load the petty cash fund'); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const r = await downloadXlsx(api, `/pcf/export${qsOf({ from, to })}`);
      toast.success(`Exported ${r.rowCount} ${r.rowCount === 1 ? 'line' : 'lines'} — ${r.filename}`);
    } catch (e: any) { toast.error(e.message || 'Export failed'); } finally { setExporting(false); }
  };

  const doVoid = async () => {
    if (!voidFor) return;
    if (!voidReason.trim()) { toast.error('A reason is required to void an additional amount'); return; }
    setBusy(true);
    try {
      await api(`/pcf/replenishments/${voidFor.id}/void`, { method: 'POST', body: JSON.stringify({ reason: voidReason.trim() }) });
      toast.success('Additional amount voided — the balance is updated');
      setVoidFor(null); setVoidReason(''); await load();
    } catch (e: any) { toast.error(e.message || 'Could not void the additional amount'); } finally { setBusy(false); }
  };

  const c = data?.cards;
  const card = (k: string, v: string, sub?: string, tone?: string) => (
    <div key={k} style={{ ...S.card, padding: '12px 16px', minWidth: '170px', flex: '1 1 170px' }}>
      <div style={{ fontSize: '11px', color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: tone || '#000' }}>{v}</div>
      {sub && <div style={{ fontSize: '11px', color: tone || '#8a8a8a' }}>{sub}</div>}
    </div>
  );
  const num = { textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties;
  const foot = { background: '#f7f7f7', fontWeight: 700 } as React.CSSProperties;
  const input = { ...S.input, width: 'auto' } as React.CSSProperties;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={S.h1}>Petty Cash Fund</h1>
          <p style={S.sub}>
            {data?.settings ? <>Custodian <b>{data.settings.custodian}</b> · opened {shortDate(data.settings.openingDate)} with {peso(Number(data.settings.fundAmount))}</>
              : 'A petty cash fund: spend it with a Disbursement Voucher paid by “Petty cash”, and top it up with an additional amount.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin && <button style={{ ...S.rowBtn, marginLeft: 0, padding: '10px 14px', fontSize: '13px' }} onClick={() => setSettingsOpen(true)}><Settings size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Fund settings</button>}
          {isAdmin && data?.configured && <button style={S.addBtn} onClick={() => setReplOpen(true)}><Plus size={15} style={{ marginRight: '6px' }} />Add amount</button>}
          <button style={{ ...S.rowBtn, marginLeft: 0, padding: '10px 14px', fontSize: '13px', opacity: !data?.configured || exporting ? 0.5 : 1 }} disabled={!data?.configured || exporting} onClick={exportXlsx}>
            <Download size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {loading && !data ? <div style={{ color: '#8a8a8a', fontSize: '14px', padding: '30px 0' }}>Loading…</div>
        : !data ? null
        : !data.configured ? (
          <div style={{ ...S.card, padding: '28px', textAlign: 'center', color: '#5a5a5a' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#000' }}>The petty cash fund isn’t set up yet.</p>
            <p style={{ margin: '6px 0 14px', fontSize: '13px' }}>Enter the custodian, the fund amount (the starting cash) and the opening date.</p>
            {isAdmin ? <button style={S.addBtn} onClick={() => setSettingsOpen(true)}>Set up the fund</button> : <p style={{ fontSize: '12px', color: '#8a8a8a' }}>An accounting or admin user needs to set it up.</p>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {card('Fund amount', peso(Number(c!.fundAmount)), 'starting cash')}
              {card('Additional amount', peso(Number(c!.additionalAmount)), 'added to the fund')}
              {card('Spent', peso(Number(c!.spent)), 'petty cash vouchers')}
              {card('Current balance', peso(Number(c!.balance)), c!.balanceNegative ? 'overspent — below zero' : 'fund + additional − spent', c!.balanceNegative ? AMBER : undefined)}
            </div>

            <div style={{ ...S.card, padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '14px', overflow: 'visible' }}>
              <label style={{ fontSize: '11px', color: '#5a5a5a' }}>From<br /><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={input} /></label>
              <label style={{ fontSize: '11px', color: '#5a5a5a' }}>To<br /><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={input} /></label>
              {(from || to) && <button style={{ ...S.rowBtn, marginLeft: 0, marginBottom: '4px' }} onClick={() => { setFrom(''); setTo(''); }}><X size={12} style={{ verticalAlign: 'middle' }} /> All dates</button>}
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#8a8a8a', paddingBottom: '8px' }}>
                {(data.voidedExcluded ?? 0) > 0 ? `${data.voidedExcluded} voided entr${data.voidedExcluded === 1 ? 'y' : 'ies'} not counted · ` : ''}running balance is for the whole fund, not just these dates
              </span>
            </div>

            <TableScroll>
              <table style={S.table}>
                <thead><tr>
                  <th style={tightTh}>Date</th>
                  <th style={tightTh}>Type</th>
                  <th style={tightTh}>Reference</th>
                  <th style={tightTh}>Description</th>
                  <th style={{ ...tightTh, textAlign: 'right', paddingRight: '16px' }}>Amount</th>
                  <th style={{ ...tightTh, textAlign: 'right', paddingRight: isAdmin ? '8px' : '16px' }}>Balance</th>
                  {isAdmin && <th style={{ ...tightTh, paddingRight: '16px' }}></th>}
                </tr></thead>
                <tbody>
                  {(data.ledger ?? []).length === 0 ? (
                    <tr><td style={{ ...tightTd, color: '#8a8a8a' }} colSpan={isAdmin ? 7 : 6}>Nothing in this period.</td></tr>
                  ) : data.ledger!.map(l => (
                    <tr key={`${l.kind}-${l.id}`}>
                      <td style={{ ...tightTd, whiteSpace: 'nowrap' }}>{shortDate(l.date)}</td>
                      <td style={{ ...tightTd, whiteSpace: 'nowrap', color: l.kind === 'replenishment' ? '#15803d' : '#262626' }}>{l.kind === 'replenishment' ? 'Additional amount' : 'Petty cash voucher'}</td>
                      <td style={{ ...tightTd, whiteSpace: 'nowrap', fontWeight: 600 }}>{l.ref || '—'}</td>
                      <td style={{ ...tightTd, maxWidth: '300px' }}><div style={oneLine} title={l.description}>{l.description || '—'}</div></td>
                      <td style={{ ...tightTd, ...num, paddingRight: '16px', color: l.kind === 'replenishment' ? '#15803d' : '#b91c1c' }}>{l.kind === 'replenishment' ? '+' : '−'}{peso(Math.abs(Number(l.amount)))}</td>
                      <td style={{ ...tightTd, ...num, fontWeight: 600, color: Number(l.balance) < 0 ? AMBER : '#000', paddingRight: isAdmin ? '8px' : '16px' }}>{peso(Number(l.balance))}</td>
                      {isAdmin && (
                        <td style={{ ...tightTd, whiteSpace: 'nowrap', textAlign: 'right', paddingRight: '16px' }}>
                          {l.kind === 'replenishment' && <button style={{ ...S.rowBtn, marginLeft: 0, color: '#b91c1c' }} title="Void this additional amount" onClick={() => { setVoidFor(l); setVoidReason(''); }}>Void</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td style={{ ...tightTd, ...foot }} colSpan={4}>Total — {data.totals?.count ?? 0} line{data.totals?.count === 1 ? '' : 's'}</td>
                  <td style={{ ...tightTd, ...foot, ...num, paddingRight: '16px' }}>{Number(data.totals?.net ?? 0) < 0 ? '−' : '+'}{peso(Math.abs(Number(data.totals?.net ?? 0)))}</td>
                  <td style={{ ...tightTd, ...foot, ...num, color: c!.balanceNegative ? AMBER : '#000' }} colSpan={isAdmin ? 2 : 1}>{peso(Number(c!.balance))}</td>
                </tr></tfoot>
              </table>
            </TableScroll>
            {c!.balanceNegative && (
              <p style={{ fontSize: '12px', color: AMBER, display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}>
                <AlertTriangle size={13} /> The fund has been spent past zero. That is allowed — add an amount to bring it back.
              </p>
            )}
          </>
        )}

      {settingsOpen && <SettingsModal api={api} current={data?.settings ?? null} log={data?.settingsLog ?? []} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); load(); }} />}
      {replOpen && <ReplenishModal api={api} openingDate={data?.settings?.openingDate ?? ''} onClose={() => setReplOpen(false)} onSaved={() => { setReplOpen(false); load(); }} />}
      {voidFor && (
        <Modal title="Void this additional amount?" onClose={() => setVoidFor(null)}
          footer={<><GhostBtn onClick={() => setVoidFor(null)}>Cancel</GhostBtn><PrimaryBtn onClick={doVoid} disabled={busy}>{busy ? 'Voiding…' : 'Void additional amount'}</PrimaryBtn></>}>
          <p style={{ fontSize: '13px', color: '#5a5a5a', marginTop: 0 }}>{shortDate(voidFor.date)} · {peso(Math.abs(Number(voidFor.amount)))}{voidFor.ref ? ` · ${voidFor.ref}` : ''}. It stays on file but stops counting, and the balance drops by that amount.</p>
          <Field label="Reason *"><TextInput value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Entered twice" /></Field>
        </Modal>
      )}
    </div>
  );
}

function SettingsModal({ api, current, log, onClose, onSaved }: {
  api: Api; current: Settings | null; log: NonNullable<PcfData['settingsLog']>; onClose: () => void; onSaved: () => void;
}) {
  const [custodian, setCustodian] = useState(current?.custodian ?? '');
  const [fund, setFund] = useState(current?.fundAmount ?? '');
  const [openDate, setOpenDate] = useState(current?.openingDate ?? manilaMonth().today);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!custodian.trim()) { toast.error('Enter the custodian’s name'); return; }
    setSaving(true);
    try {
      await api('/pcf/settings', { method: 'PUT', body: JSON.stringify({ custodian, fundAmount: fund, openingDate: openDate }) });
      toast.success('Fund settings saved'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Could not save the settings'); } finally { setSaving(false); }
  };
  return (
    <Modal title={current ? 'Fund settings' : 'Set up the petty cash fund'} onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryBtn></>}>
      <Field label="Custodian *"><TextInput value={custodian} onChange={e => setCustodian(e.target.value)} placeholder="Who holds the cash" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Field label="Fund amount (starting cash) *"><TextInput value={fund} onChange={e => setFund(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
        <Field label="Opening date *"><TextInput type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} /></Field>
      </div>
      <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '-6px' }}>The balance counts additional amounts and petty-cash vouchers dated on or after the opening date. Every change here is logged.</p>
      {log.length > 0 && (
        <div style={{ borderTop: '1px solid #e6e6e6', paddingTop: '10px', marginTop: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#8a8a8a', marginBottom: '4px' }}>Change log</div>
          <div style={{ maxHeight: '130px', overflowY: 'auto', fontSize: '12px', color: '#5a5a5a' }}>
            {log.map((l, i) => <div key={i}>{l.at} · {l.by || 'someone'} · {FIELD_LABEL[l.field] || l.field}: {l.from === null ? 'set to' : `${l.from} →`} {l.to}</div>)}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReplenishModal({ api, openingDate, onClose, onSaved }: { api: Api; openingDate: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(manilaMonth().today);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!amount.trim()) { toast.error('Enter the amount'); return; }
    setSaving(true);
    try {
      await api('/pcf/replenishments', { method: 'POST', body: JSON.stringify({ date, amount, reference, notes }) });
      toast.success('Amount added to the fund'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Could not add the amount'); } finally { setSaving(false); }
  };
  return (
    <Modal title="Add amount" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancel</GhostBtn><PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add'}</PrimaryBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Field label="Date *"><TextInput type="date" value={date} min={openingDate || undefined} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Amount *"><TextInput value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
      </div>
      <Field label="Reference (e.g. check no.)"><TextInput value={reference} onChange={e => setReference(e.target.value)} /></Field>
      <Field label="Notes"><TextInput value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <p style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '-6px' }}>Money moved into the fund. It is not an expense and counts toward no project’s spend.</p>
    </Modal>
  );
}
