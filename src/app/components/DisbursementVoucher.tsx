// ============================================================================
// Disbursement Voucher — the one place cash goes out.
//
// This REPLACES the old "Log Expense" form. A voucher pays two kinds of thing, and can mix them:
//   • PAY PO lines   — settle a supplier invoice (a purchase order). Searchable picker; the amount
//                      starts at what is still owed and is editable.
//   • EXPENSE lines  — a direct cost charged to a project, trading deal or facility, split exactly as
//                      the old form split it.
// With only expense lines it is the same form, sending the same request, as before.
//
// Paying a PO is NOT spend: that PO's cost already counts toward its project through its purchase
// request. The two kinds of line are kept in separate tables on the server for exactly that reason,
// and this form says so out loud beside the Pay PO section.
//
// All money is whole centavos (see lib/voucherMath). Save stays disabled until the lines equal the
// amount paid. The voucher number (EXP-YYYY-NNNN) is assigned by the server when it is saved.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Split, Trash2, X, Search, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { AllocationTag, type Allocated } from './AllocationTag';
import {
  type VoucherDraft, type PayableLite, type PaymentMode, type TargetKind,
  buildVoucherPayload, voucherTotals, restForLine, defaultPoAmount, totalFromLines,
  filterPayables, suggestDescription, encodeTarget, manilaToday,
} from '../lib/voucherMath';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

export interface VoucherTargetItem { id: string; name: string; status?: string | null }
export interface VoucherTargetRef { kind: TargetKind; id: string; name?: string }

export interface Payable extends PayableLite, Allocated {
  poDate: string; paidTotal: string; dueDate: string | null; poStatus: string;
}

const peso = (n: number | string) =>
  `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'block text-sm font-medium text-gray-700 mb-1';

export function DisbursementVoucherModal({ api, projects, tradings, facilities, initialTarget, initialPoId, onClose, onSaved }: {
  api: Api;
  projects: VoucherTargetItem[]; tradings: VoucherTargetItem[]; facilities: VoucherTargetItem[];
  /** Opened from a project/trading/facility: its first expense line is pre-pointed at it. */
  initialTarget?: VoucherTargetRef | null;
  /** Opened from the Payable Report: that PO is pre-loaded as a PO line. */
  initialPoId?: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const today = manilaToday();
  const nextKey = useRef(100);
  const [d, setD] = useState<VoucherDraft>(() => ({
    amount: '', expenseDate: today, description: '', payee: '', referenceNo: '',
    paymentMode: '', checkNo: '', bank: '', checkDate: '',
    // One empty expense row to start, as the old form did — unless a PO is what brought us here.
    expenseLines: [{ key: 1, target: initialTarget ? encodeTarget(initialTarget.kind, initialTarget.id) : '', amount: '' }],
    poLines: [],
  }));
  const [saving, setSaving] = useState(false);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payablesState, setPayablesState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const set = <K extends keyof VoucherDraft>(k: K, v: VoucherDraft[K]) => setD(p => ({ ...p, [k]: v }));
  // The description is suggested for a PO-only voucher until the person types their own.
  const descTouched = useRef(false);

  useEffect(() => {
    let off = false;
    api<{ payables: Payable[] }>('/payables?payable=1')
      .then(r => { if (!off) { setPayables(r.payables || []); setPayablesState('ready'); } })
      .catch(() => { if (!off) setPayablesState('failed'); });
    return () => { off = true; };
  }, []);

  const byId = useMemo(() => new Map(payables.map(p => [p.id, p])), [payables]);

  // Arrived from the Payable Report: add that PO once the list has loaded.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialPoId || payablesState !== 'ready') return;
    seeded.current = true;
    const p = byId.get(initialPoId);
    if (!p) return;
    setD(prev => {
      const amt = defaultPoAmount(p.balance);
      const poLines = [{ key: nextKey.current++, purchaseOrderId: p.id, amount: amt }];
      return {
        ...prev, poLines,
        // The empty expense row is only a convenience for the expense-first case.
        expenseLines: prev.expenseLines.filter(r => r.target !== '' || r.amount.trim() !== ''),
        amount: prev.amount || amt,
        description: prev.description || suggestDescription(poLines, byId),
      };
    });
  }, [payablesState, initialPoId, byId]);

  const t = voucherTotals(d);

  // Live entries first; a Completed project/trading stays pickable because receipts often arrive
  // after the job is done.
  const byStatus = <T extends VoucherTargetItem>(xs: T[]) => [...xs].sort((a, b) =>
    Number(a.status === 'Completed') - Number(b.status === 'Completed') || a.name.localeCompare(b.name));
  const groups = useMemo(() => [
    { label: 'Projects', kind: 'project' as TargetKind, items: byStatus(projects) },
    { label: 'Trading deals', kind: 'trading' as TargetKind, items: byStatus(tradings) },
    { label: 'Facilities', kind: 'facility' as TargetKind, items: byStatus(facilities) },
  ].filter(g => g.items.length > 0), [projects, tradings, facilities]);

  // ---- PO lines
  const addPoLine = () => setD(p => ({ ...p, poLines: [...p.poLines, { key: nextKey.current++, purchaseOrderId: '', amount: '' }] }));
  const delPoLine = (key: number) => setD(p => ({ ...p, poLines: p.poLines.filter(r => r.key !== key) }));
  const setPoLine = (key: number, patch: Partial<{ purchaseOrderId: string; amount: string }>) =>
    setD(p => ({ ...p, poLines: p.poLines.map(r => (r.key === key ? { ...r, ...patch } : r)) }));
  const pickPo = (key: number, po: Payable) => {
    setD(p => {
      const poLines = p.poLines.map(r => (r.key === key
        ? { ...r, purchaseOrderId: po.id, amount: r.amount.trim() ? r.amount : defaultPoAmount(po.balance) } : r));
      return {
        ...p, poLines,
        description: descTouched.current || p.description.trim() ? p.description : suggestDescription(poLines, byId),
      };
    });
  };

  // ---- expense lines
  const addRow = () => setD(p => ({ ...p, expenseLines: [...p.expenseLines, { key: nextKey.current++, target: '', amount: '' }] }));
  const delRow = (key: number) => setD(p => ({
    ...p,
    // Without PO lines the old rule stands: there is always at least one expense row to fill.
    expenseLines: p.poLines.length === 0 && p.expenseLines.length === 1 ? p.expenseLines : p.expenseLines.filter(r => r.key !== key),
  }));
  const setRow = (key: number, k: 'target' | 'amount', v: string) =>
    setD(p => ({ ...p, expenseLines: p.expenseLines.map(r => (r.key === key ? { ...r, [k]: v } : r)) }));

  const save = async () => {
    const built = buildVoucherPayload(d);
    if (!built.ok) { toast.error(built.error); return; }
    setSaving(true);
    try {
      const res = await api<{ serialNo?: string }>('/expenses', { method: 'POST', body: JSON.stringify(built.payload) });
      const nPo = d.poLines.length;
      const nEx = (built.payload.allocations as unknown[]).length;
      toast.success(`${res?.serialNo ? `Voucher ${res.serialNo} — ` : ''}${peso(Number(built.payload.amount))} out: ${
        [nPo ? `${nPo} PO payment${nPo === 1 ? '' : 's'}` : '', nEx ? `${nEx} expense line${nEx === 1 ? '' : 's'}` : ''].filter(Boolean).join(' + ')}`);
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  const totalLabel = t.totalCentavos === null ? '—' : peso(t.totalCentavos / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-900">Disbursement Voucher</h3>
            <p className="text-xs text-gray-400">The Voucher No. (EXP-…) is assigned when you save.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* ---- header ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Amount paid (₱) <span className="text-red-500">*</span></label>
              <input inputMode="decimal" value={d.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className={input} />
            </div>
            <div>
              <label className={label}>Date <span className="text-red-500">*</span></label>
              <input type="date" max={today} value={d.expenseDate} onChange={e => set('expenseDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Paid to <span className="text-gray-400 font-normal">(payee)</span></label>
              <input value={d.payee} onChange={e => set('payee', e.target.value)} maxLength={200} className={input} />
            </div>
            <div>
              <label className={label}>Payment mode</label>
              <select value={d.paymentMode} onChange={e => set('paymentMode', e.target.value as PaymentMode)} className={`${input} bg-white`}>
                <option value="">Not specified</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-400">The total that left the company — the check amount, or the cash handed over — VAT included.</p>

          <CheckDetailsFields mode={d.paymentMode} checkNo={d.checkNo} bank={d.bank} checkDate={d.checkDate}
            onChange={(k, v) => set(k, v)} />

          <div>
            <label className={label}>Description <span className="text-red-500">*</span></label>
            <textarea value={d.description} onChange={e => { descTouched.current = true; set('description', e.target.value); }} rows={2} maxLength={500}
              placeholder="e.g. Payment of PO KTCI-2026-0021 — Seno Metal, or: Lalamove — steel delivery to site"
              className={`${input} resize-none`} />
          </div>

          {/* ---- PAY PO ---- */}
          <div className="border border-gray-200 rounded-xl overflow-visible">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-xl">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"><FileText className="w-4 h-4 text-gray-500" /> Pay PO</div>
              <button onClick={addPoLine} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50"><Plus className="w-3.5 h-3.5" /> Add PO payment</button>
            </div>
            {d.poLines.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400">
                Settle a supplier invoice. A payment here reduces what is owed on the PO and is <strong>not</strong> charged to a
                project again — the PO&rsquo;s cost already counts through its purchase request.
                {payablesState === 'failed' && <span className="text-amber-700"> The purchase-order list could not be loaded.</span>}
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {d.poLines.map(r => {
                  const po = byId.get(r.purchaseOrderId);
                  return (
                    <div key={r.key} className="p-3 flex flex-col sm:flex-row sm:items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <PoPicker payables={payables} loading={payablesState === 'loading'}
                          selected={po} excludeIds={d.poLines.filter(x => x.key !== r.key).map(x => x.purchaseOrderId)}
                          onPick={p => pickPo(r.key, p)} onClear={() => setPoLine(r.key, { purchaseOrderId: '' })} />
                        {po && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            PO total {peso(po.poTotal)} · owed {peso(po.balance)}
                            {po.overdue && <span className="text-red-600 font-medium"> · overdue</span>}
                            {Number(po.paidTotal) > 0 && <span> · already paid {peso(po.paidTotal)}</span>}
                          </p>
                        )}
                      </div>
                      <div className="w-full sm:w-36">
                        <input inputMode="decimal" value={r.amount} onChange={e => setPoLine(r.key, { amount: e.target.value })}
                          placeholder="0.00" className={`${input} text-right`} aria-label="Amount to pay on this PO" />
                      </div>
                      <div className="flex items-center gap-1">
                        {po && <button onClick={() => setPoLine(r.key, { amount: defaultPoAmount(po.balance) })} title="Pay the full amount still owed"
                          className="px-2 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 whitespace-nowrap">Owed</button>}
                        <button onClick={() => setPoLine(r.key, { amount: restForLine(d, 'po', r.key) })} title="Fill the remaining amount"
                          className="px-2 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 whitespace-nowrap">Rest</button>
                        <button onClick={() => delPoLine(r.key)} title="Remove this PO payment"
                          className="p-2 text-gray-400 rounded-lg hover:bg-gray-50 hover:text-gray-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- EXPENSES ---- */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"><Split className="w-4 h-4 text-gray-500" /> Expenses — charge to</div>
              <button onClick={addRow} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50"><Plus className="w-3.5 h-3.5" /> Add split</button>
            </div>
            <div className="divide-y divide-gray-100">
              {d.expenseLines.map((r, i) => (
                <div key={r.key} className="p-3 flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1 min-w-0">
                    {i === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Target</label>}
                    <select value={r.target} onChange={e => setRow(r.key, 'target', e.target.value)} className={`${input} bg-white`}>
                      <option value="">Choose a project, trading or facility…</option>
                      {groups.map(g => (
                        <optgroup key={g.kind} label={g.label}>
                          {g.items.map(x => (
                            <option key={x.id} value={encodeTarget(g.kind, x.id)}>{x.name}{x.status === 'Completed' ? ' (completed)' : ''}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-36">
                    {i === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Amount (₱)</label>}
                    <input inputMode="decimal" value={r.amount} onChange={e => setRow(r.key, 'amount', e.target.value)}
                      placeholder="0.00" className={`${input} text-right`} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRow(r.key, 'amount', restForLine(d, 'expense', r.key))} title="Fill the remaining amount"
                      className="px-2 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 whitespace-nowrap">Rest</button>
                    <button onClick={() => delRow(r.key)} disabled={d.poLines.length === 0 && d.expenseLines.length === 1} title="Remove this line"
                      className="p-2 text-gray-400 rounded-lg hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {d.expenseLines.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">No expense lines — this voucher only pays purchase orders.</p>}
            </div>
          </div>

          {/* ---- the running balance. Save stays disabled until this reads exactly balanced. ---- */}
          <div className={`px-3 py-2.5 rounded-xl border text-sm flex flex-wrap items-center justify-between gap-2 ${
            t.balanced ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <span className="font-medium">
              Lines {peso(t.linesCentavos / 100)} of {totalLabel}
              {t.poCentavos > 0 && t.expenseCentavos > 0 && (
                <span className="font-normal text-xs"> &nbsp;({peso(t.poCentavos / 100)} PO payments + {peso(t.expenseCentavos / 100)} expenses)</span>
              )}
            </span>
            <span className="flex items-center gap-2 font-semibold whitespace-nowrap">
              {t.totalCentavos === null ? 'Enter the amount paid first'
                : t.balanced ? 'Balanced ✓'
                : !t.hasLines ? 'Add a PO payment or an expense line'
                : t.remaining > 0 ? `${peso(t.remaining / 100)} left to allocate`
                : `${peso(-t.remaining / 100)} over-allocated`}
              {!t.balanced && t.hasLines && (
                <button onClick={() => set('amount', totalFromLines(d))} title="Set the amount paid to the sum of the lines"
                  className="px-2 py-1 text-xs font-medium border border-amber-300 bg-white text-amber-800 rounded-lg hover:bg-amber-100">Match amount to lines</button>
              )}
            </span>
          </div>

          <div>
            <label className={label}>Reference <span className="text-gray-400 font-normal">(OR / receipt no., optional)</span></label>
            <input value={d.referenceNo} onChange={e => set('referenceNo', e.target.value)} maxLength={100} className={input} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving || !t.balanced} title={t.balanced ? '' : 'The lines must add up to the amount paid'}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save voucher'}</button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------
// A searchable PO picker. Shows PO No., supplier, the PO total and what is still owed, so the right
// order can be told apart from a look-alike without opening another screen.
// ----------------------------------------------------------------------------------------------
export function PoPicker({ payables, loading, selected, excludeIds, onPick, onClear }: {
  payables: Payable[]; loading: boolean; selected?: Payable; excludeIds: string[];
  onPick: (p: Payable) => void; onClear: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => filterPayables(payables, q, excludeIds) as Payable[], [payables, q, excludeIds]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50">
        <span className="min-w-0 truncate"><span className="font-mono font-semibold text-gray-900">{selected.poNumber}</span>
          <span className="text-gray-500"> · {selected.supplier || 'Unknown supplier'}</span>
          {selected.allocationName && <span className="text-gray-500"> · <AllocationTag a={selected} maxWidth={180} /></span>}</span>
        <button onClick={onClear} className="text-xs font-medium text-blue-600 hover:underline flex-shrink-0">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={loading ? 'Loading purchase orders…' : 'Search PO no., supplier or project…'}
        className={`${input} pl-9`} aria-label="Search purchase orders" />
      {open && <PoPickerList matches={matches} loading={loading} query={q} onPick={p => { onPick(p); setQ(''); setOpen(false); }} />}
    </div>
  );
}


// ----------------------------------------------------------------------------------------------
// Check number / bank / check date. Shown ONLY for a check payment: a check number means nothing on
// a cash payment, and the server refuses it there. Pure, so it can be rendered on its own.
// ----------------------------------------------------------------------------------------------
export function CheckDetailsFields({ mode, checkNo, bank, checkDate, onChange }: {
  mode: PaymentMode; checkNo: string; bank: string; checkDate: string;
  onChange: (k: 'checkNo' | 'bank' | 'checkDate', v: string) => void;
}) {
  if (mode !== 'check') return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200" data-check-details>
      <div>
        <label className={label}>Check no. <span className="text-red-500">*</span></label>
        <input value={checkNo} onChange={e => onChange('checkNo', e.target.value)} maxLength={50} className={input} />
      </div>
      <div>
        <label className={label}>Bank</label>
        <input value={bank} onChange={e => onChange('bank', e.target.value)} maxLength={100} className={input} />
      </div>
      <div>
        <label className={label}>Check date</label>
        <input type="date" value={checkDate} onChange={e => onChange('checkDate', e.target.value)} className={input} />
      </div>
    </div>
  );
}

// The dropdown under the search box. What the person sees is what tells two look-alike orders apart.
export function PoPickerList({ matches, loading, query, onPick }: {
  matches: Payable[]; loading: boolean; query: string; onPick: (p: Payable) => void;
}) {
  return (
    <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg" data-po-list>
      {matches.length === 0 ? (
        <p className="px-3 py-3 text-xs text-gray-400">{loading ? 'Loading…' : query ? 'No purchase order matches that.' : 'No purchase orders to pay.'}</p>
      ) : matches.map(p => (
        // onMouseDown, not onClick: the input's blur would otherwise close the list before the click lands.
        <button key={p.id} type="button" data-po={p.id} onMouseDown={e => { e.preventDefault(); onPick(p); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-semibold text-gray-900">{p.poNumber}</span>
            <span className="text-xs font-semibold text-gray-700">owed {peso(p.balance)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
            <span className="truncate">{p.supplier || 'Unknown supplier'}</span>
            <span className="whitespace-nowrap">PO total {peso(p.poTotal)}{p.overdue && <span className="text-red-600 font-medium"> · overdue</span>}
              {p.status === 'overpaid' && <span className="text-amber-700 font-medium"> · <AlertTriangle className="inline w-3 h-3 -mt-0.5" /> overpaid</span>}</span>
          </div>
          {p.allocationName && <div className="text-xs text-gray-500 mt-0.5 min-w-0">For <AllocationTag a={p} maxWidth={260} /></div>}
        </button>
      ))}
    </div>
  );
}
