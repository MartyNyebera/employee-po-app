// ============================================================================
// Cost-centre screens shared by the Accounting portal and the Administrator dashboard: CONTRACT TRADING (trading
// deals) and FACILITIES, with their New/Edit modals, the per-target Expenses list, and the VAT-basis field.
//
// Moved here unchanged from pages/AccountingPortal.tsx (same pattern as crm/BillingInvoices): every component takes
// the caller's fetcher as `api`, so the Accounting portal passes its accounting-token fetch and the Administrator
// dashboard passes the admin one. The screens are presentational; each host owns the lists, the spend and the modals.
// ============================================================================

import { useEffect, useState } from 'react';
import { X, Plus, Receipt, Ban, Split, Building2, Pencil, Trash2, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { onBackdropDown, backdropClose } from '../lib/backdrop';
import { ExportXlsxButton } from './ExportXlsxButton';
import { DualBasisProfit, type DualBasisRow, type BasisTotals } from './DualBasisProfit';
import { TradingProfitBars } from './TradingProfitBars';

export type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// How an entered price is to be read. Supplier and client prices arrive both ways, so the number
// alone is ambiguous and each one carries its own tag. 'exempt' is VAT-free on both bases — it is
// offered because purchase_orders.vat_type can already be 'non-vatable', so a VAT-free trade is
// representable on the buy side and the sell side must be able to say the same.
export type VatBasis = 'inclusive' | 'exclusive' | 'exempt';
export const VAT_BASIS_OPTIONS: { value: VatBasis; label: string; hint: string }[] = [
  { value: 'inclusive', label: 'VAT-inclusive', hint: 'The price already contains 12% VAT (the usual case — type it exactly as quoted or billed)' },
  { value: 'exclusive', label: 'VAT-exclusive', hint: 'The price is net of VAT; 12% would be added on top' },
  { value: 'exempt', label: 'VAT-exempt / zero-rated', hint: 'No VAT either way — both bases show this number unchanged' },
];

// Internal company facility (equipment/items used internally, not a client project). Simpler than a
// Project — just a budget target; spend is tracked from the purchase requests charged to it.
export interface Facility {
  id: string; name: string; description?: string; status?: string;
  location?: string; budgetAllocation?: number;
}
// A TRADING DEAL as a cost centre — the third sibling of Project and Facility. It carries a selling
// price rather than a budget, because the useful question for a trade is margin, not budget adherence.
//
// Not to be confused with the sales-line taxonomy ('Trading (electrical)', 'Trading (mechanical)')
// used on inquiries and sales orders. Same word, unrelated concept.
export interface Trading {
  id: string; name: string; client?: string | null; status?: string;
  sellingPrice?: number | null; salesOrderId?: string | null;
  sellingPriceVat?: VatBasis;
  /** When the deal is expected to be delivered; the Overview alerts on it until a Delivery Receipt exists. Optional. */
  expectedDeliveryDate?: string | null;
}
// One basis's figures, computed server-side. revenue / profit / marginPercent are null until a
// non-zero price is set, which is what keeps "not priced yet" distinct from a real zero.
export interface BasisFigures {
  revenue: number | null; cost: number; costPrs: number; costExpenses: number;
  profit: number | null; marginPercent: number | null;
}

// margin (profit) and marginPercent both come from TRADING_SPEND_SQL already computed — this screen
// never does money math. Both are null until a non-zero selling price exists, which is what makes
// "set selling price" distinguishable from a genuine zero margin.
export interface TradingSpend {
  tradingId: string; name: string; client?: string | null; status?: string;
  sellingPrice: number | null; spentPrs: number; spentExpenses: number; spent: number;
  margin: number | null; marginPercent: number | null;
  sellingPriceVat: VatBasis;
  exVat: BasisFigures; incVat: BasisFigures;
}
export interface FacilitySpend { facilityId: string; spentPrs: number; spentExpenses: number; spent: number; }

// What a target can be. One expense is split across allocation lines, and each line charges exactly
// ONE of these — enforced by a num_nonnulls CHECK in the DB, not just here.
export type TargetKind = 'project' | 'trading' | 'facility';
export interface TargetRef { kind: TargetKind; id: string; name: string }
export const TARGET_PATH: Record<TargetKind, string> = { project: 'projects', trading: 'tradings', facility: 'facilities' };

// ONE allocation line as the server returns it: this target's own share (`amount`) plus the receipt
// it came from (`expenseTotal`), so a split can be explained without fetching its sibling lines.
// `amount` here and `expenseTotal` are both receipt money, VAT included — PR spend is VAT-exclusive;
// the difference is deliberate and must not be "fixed".
export interface ExpenseAllocation {
  allocationId: number; expenseId: number; serialNo?: string | null;
  projectId?: string | null; tradingId?: string | null; facilityId?: string | null;
  amount: number; expenseTotal: number; isSplit: boolean; allocationCount: number;
  // How many purchase orders the same voucher also pays. Voiding from here voids the whole voucher.
  poPaymentCount?: number;
  targets?: string | null;
  description: string; expenseDate: string;
  payee?: string | null; referenceNo?: string | null; createdBy?: string | null; createdAt?: string;
  voidedAt?: string | null; voidedBy?: string | null; voidReason?: string | null;
}

// The basis picker that sits beside every entered price. Deliberately a plain <select> rather than
// a segmented toggle: three options with real consequences read better as a named list, and the
// helper line below restates the chosen one in words so the basis can never be picked by accident.
export function VatBasisField({ value, onChange, idSuffix }: { value: VatBasis; onChange: (v: VatBasis) => void; idSuffix: string }) {
  const chosen = VAT_BASIS_OPTIONS.find(o => o.value === value) ?? VAT_BASIS_OPTIONS[0];
  return (
    <div>
      <label htmlFor={`vat-basis-${idSuffix}`} className="block text-sm font-medium text-gray-700 mb-1 leading-5 min-h-[2.5rem]">
        Price is
      </label>
      <select
        id={`vat-basis-${idSuffix}`}
        value={value}
        onChange={e => onChange(e.target.value as VatBasis)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {VAT_BASIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="mt-1 text-xs text-gray-400">{chosen.hint}</p>
    </div>
  );
}


// ============================================================================
// Facility modal — a facility is just a named category (optional description) that PRs can be
// tagged to. Budget/status/location columns still exist in the DB (so existing rows load) but are
// no longer shown or required here.
// ============================================================================
export function FacilityModal({ api, initial, onClose, onSaved }: { api: Api; initial: Facility | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name || '', description: initial?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast.error('Facility name is required'); return; }
    setSaving(true);
    try {
      // Only name + description are sent. On create the server applies its column defaults
      // (status 'Active', budget 0); on edit, omitted fields are left untouched.
      const body = { name: f.name.trim(), description: f.description.trim() || null };
      if (initial) await api(`/facilities/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/facilities', { method: 'POST', body: JSON.stringify(body) });
      toast.success(initial ? 'Facility updated' : 'Facility created');
      onSaved();
    } catch (e: any) { toast.error((initial ? 'Update' : 'Create') + ' failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  const flabel = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{initial ? 'Edit Facility' : 'New Facility'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className={flabel}>Facility Name <span className="text-red-500">*</span></label>
            <input value={f.name} onChange={e => set('name', e.target.value)} className={input} />
          </div>
          <div>
            <label className={flabel}>Description</label>
            <textarea value={f.description} onChange={e => set('description', e.target.value)} rows={3} className={`${input} resize-none`} placeholder="Optional — what this facility category is for" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : (initial ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// A target's expenses — the spend summary (from the server), every allocation line charged to it,
// and Void. Works for a project, a trading deal or a facility; only the stat strip differs, because
// a project has a budget to measure against and a trading has a selling price.
//
// Voiding keeps the rows (struck through, with who/why) so the money record is never lost; it just
// stops counting toward spend. A void reverses the WHOLE receipt, every split line of it at once —
// the confirmation says so explicitly when the receipt was split, because voiding from one project's
// screen also pulls the money off whatever else it was shared with.
// ============================================================================
export function ExpensesModal({ api, target, stats, reloadKey, onClose, onLog, onChanged, canManage = true }: {
  api: Api;
  /** false: read-only (no New Voucher, no Void). */
  canManage?: boolean;
  target: TargetRef;
  stats: { label: string; value: string; tone?: string }[];
  reloadKey: number;
  onClose: () => void; onLog: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<ExpenseAllocation[] | null>(null);
  const [voiding, setVoiding] = useState<ExpenseAllocation | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setRows(await api<ExpenseAllocation[]>(`/${TARGET_PATH[target.kind]}/${target.id}/expenses`)); }
    catch (e: any) { toast.error('Could not load expenses: ' + e.message); setRows([]); }
  };
  useEffect(() => { load(); }, [target.kind, target.id, reloadKey]);

  const confirmVoid = async () => {
    if (!voiding) return;
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setBusy(true);
    try {
      await api(`/expenses/${voiding.expenseId}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      toast.success(`Expense of ${peso(voiding.expenseTotal)} voided`);
      setVoiding(null); setReason('');
      await load();
      onChanged();
    } catch (e: any) { toast.error('Void failed: ' + e.message); } finally { setBusy(false); }
  };

  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  // People type the reference either bare ("88121") or with the prefix ("OR 88121", "O.R. #88121");
  // normalise so it never reads "OR OR 88121". The lookahead keeps e.g. "ORD-551" intact.
  const refLabel = (r: string) => `OR ${r.replace(/^\s*o\.?\s*r\.?(?![a-z])\s*(no\.?|#)?\s*/i, '')}`;
  // The voucher number leads, because it is what ties this line to a piece of paper in a folder.
  // It belongs to the whole receipt, so on a split it is the SAME number on every line here.
  const meta = (x: ExpenseAllocation) => [x.serialNo, x.payee, x.referenceNo && refLabel(x.referenceNo)].filter(Boolean).join(' · ');
  // A split line shows ITS share as the amount, and says what the whole receipt was and how it was
  // divided — otherwise ₱600 against a ₱1,000 receipt looks like a data error.
  const splitNote = (x: ExpenseAllocation) => !x.isSplit ? null : (
    <div className="text-xs text-blue-700 mt-0.5 flex items-start gap-1">
      <Split className="w-3 h-3 mt-0.5 flex-shrink-0" />
      <span>{peso(x.amount)} of a {peso(x.expenseTotal)} receipt split {x.allocationCount} ways{x.targets ? ` — ${x.targets}` : ''}</span>
    </div>
  );
  const voidAction = (x: ExpenseAllocation) => x.voidedAt
    ? <span className="text-xs font-medium text-gray-400">Voided</span>
    : !canManage ? null : <button onClick={() => { setVoiding(x); setReason(''); }} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Ban className="w-3.5 h-3.5" /> Void</button>;
  // A flex-wrap strip, not a grid: professional-design-complete.css forces `.grid-cols-2` with
  // !important, which beats any sm:grid-cols-N and would pin this to two columns everywhere.
  const stat = (label: string, value: string, tone = 'text-gray-900') => (
    <div className="min-w-[7rem]" key={label}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-semibold ${tone} whitespace-nowrap`}>{value}</div>
    </div>
  );
  const KIND_LABEL: Record<TargetKind, string> = { project: 'project', trading: 'trading deal', facility: 'facility' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{target.name}</h3>
            <p className="text-xs text-gray-500">Direct expenses — costs that didn't go through a purchase request</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map(s => stat(s.label, s.value, s.tone))}
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{rows ? `${rows.length} record${rows.length === 1 ? '' : 's'}` : 'Loading…'}</span>
            {canManage && <button onClick={onLog} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> New Voucher</button>}
          </div>
          {rows && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400"><Receipt className="w-9 h-9 mb-2 text-gray-300" /><p className="text-sm">No expenses logged for this {KIND_LABEL[target.kind]} yet.</p></div>
          ) : rows && (
            <>
            {/* Phone: one card per expense, so the amount is always on screen (a table scrolls it away). */}
            <div className="sm:hidden space-y-2">
              {rows.map(x => {
                const voided = !!x.voidedAt;
                return (
                  <div key={x.allocationId} className={`border border-gray-200 rounded-xl p-3 ${voided ? 'bg-gray-50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={voided ? 'text-gray-400 line-through' : 'text-gray-900'}>{x.description}</div>
                        <div className="text-xs text-gray-400">{[fmtDate(x.expenseDate), meta(x)].filter(Boolean).join(' · ')}</div>
                        {splitNote(x)}
                      </div>
                      <div className={`whitespace-nowrap font-semibold ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{peso(x.amount)}</div>
                    </div>
                    {voided && <div className="text-xs text-red-600 mt-1">Voided by {x.voidedBy || 'unknown'}: {x.voidReason}</div>}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-500 truncate">Logged by {x.createdBy || '—'}</span>
                      {voidAction(x)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Description</th>
                      <th className="px-3 py-2.5 text-right">Charged here</th>
                      <th className="px-3 py-2.5">Logged by</th>
                      <th className="px-3 py-2.5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(x => {
                      const voided = !!x.voidedAt;
                      return (
                        <tr key={x.allocationId} className={`border-b border-gray-100 last:border-0 align-top ${voided ? 'bg-gray-50' : ''}`}>
                          <td className={`px-3 py-2.5 whitespace-nowrap ${voided ? 'text-gray-400' : 'text-gray-700'}`}>{fmtDate(x.expenseDate)}</td>
                          <td className="px-3 py-2.5 min-w-[14rem]">
                            <div className={voided ? 'text-gray-400 line-through' : 'text-gray-900'}>{x.description}</div>
                            {meta(x) && <div className="text-xs text-gray-400">{meta(x)}</div>}
                            {splitNote(x)}
                            {voided && (
                              <div className="text-xs text-red-600 mt-0.5">Voided by {x.voidedBy || 'unknown'}: {x.voidReason}</div>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{peso(x.amount)}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{x.createdBy || '—'}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{voidAction(x)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {voiding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(() => setVoiding(null))}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">Void this expense?</h3>
              <p className="mt-1 text-sm text-gray-500">{peso(voiding.expenseTotal)} — {voiding.description}</p>
            </div>
            <div className="p-5 space-y-2">
              {voiding.isSplit && (
                <div className="flex items-start gap-2 p-3 mb-1 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <Split className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>This receipt is split {voiding.allocationCount} ways{voiding.targets ? ` (${voiding.targets})` : ''}. Voiding it removes the money from <strong>all</strong> of them, not just this one.</span>
                </div>
              )}
              {(voiding.poPaymentCount ?? 0) > 0 && (
                <div className="flex items-start gap-2 p-3 mb-1 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <span>This voucher also pays {voiding.poPaymentCount} purchase order{voiding.poPaymentCount === 1 ? '' : 's'}. Voiding it reverses those payments too — each PO goes back to <strong>owing</strong> what was paid.</span>
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
              <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
                placeholder="e.g. Duplicate — already logged under OR 88120"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <p className="text-xs text-gray-400">The record stays on file, struck through, and stops counting toward spend.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setVoiding(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={confirmVoid} disabled={busy || !reason.trim()} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{busy ? 'Voiding…' : 'Void expense'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// New / Edit a trading deal. Name is all that's required; a selling price is optional and only
// exists so the Trading Deals table can show margin. No budget field — see the Trading interface.
// ============================================================================
export function TradingModal({ api, trading, onClose, onSaved }: {
  api: Api; trading: Trading | null; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: trading?.name ?? '', client: trading?.client ?? '',
    status: trading?.status ?? 'Active',
    sellingPrice: trading?.sellingPrice != null ? String(trading.sellingPrice) : '',
    expectedDeliveryDate: trading?.expectedDeliveryDate || '',
  });
  const [saving, setSaving] = useState(false);
  // The basis of the selling price. Defaults to VAT-inclusive, which is both the common case and
  // the basis every already-priced deal was backfilled to.
  const [vat, setVat] = useState<VatBasis>(trading?.sellingPriceVat ?? 'inclusive');
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast.error('Name is required'); return; }
    const price = f.sellingPrice.replace(/,/g, '').trim();
    if (price && (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) < 0)) { toast.error('Selling price must be a peso amount, or left blank'); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({
        name: f.name.trim(), client: f.client.trim() || null,
        status: f.status, sellingPrice: price === '' ? null : price,
        sellingPriceVat: vat, expectedDeliveryDate: f.expectedDeliveryDate || null,
      });
      if (trading) await api(`/tradings/${trading.id}`, { method: 'PATCH', body });
      else await api('/tradings', { method: 'POST', body });
      toast.success(trading ? 'Trading updated' : 'Trading created');
      onSaved();
    } catch (e: any) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onBackdropDown} onClick={backdropClose(onClose)}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{trading ? 'Edit Trading Deal' : 'New Trading Deal'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className={label}>Name <span className="text-red-500">*</span></label>
            <input autoFocus value={f.name} onChange={e => set('name', e.target.value)} maxLength={200}
              placeholder="e.g. Air pumps — RESUN ACO-012 for NHK" className={input} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Client <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={f.client} onChange={e => set('client', e.target.value)} maxLength={200} className={input} />
            </div>
            <div>
              <label className={label}>Status</label>
              <select value={f.status} onChange={e => set('status', e.target.value)} className={`${input} bg-white`}>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label className={label}>Selling price (₱) <span className="text-gray-400 font-normal">(optional)</span></label>
              <input inputMode="decimal" value={f.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} placeholder="0.00" className={input} />
              <p className="mt-1 text-xs text-gray-400">Type it exactly as quoted. Leave blank to just accumulate cost.</p>
            </div>
            {/* The basis is what makes the price mean something: the same 26,940 is two different
                revenues depending on whether VAT is already in it. */}
            <VatBasisField value={vat} idSuffix="trading" onChange={setVat} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label className={label}>Expected delivery date <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" value={f.expectedDeliveryDate} onChange={e => set('expectedDeliveryDate', e.target.value)} className={input} data-field="expectedDeliveryDate" />
              <p className="mt-1 text-xs text-gray-400">The Overview warns until a Delivery Receipt exists for this deal.</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : trading ? 'Save changes' : 'Create trading'}</button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// The stat strips above a trading deal's / facility's expense list (a project's stays in the Accounting portal).
// ============================================================================
export function tradingExpenseStats(s: TradingSpend | null): { label: string; value: string; tone?: string }[] {
  return [
    { label: 'Purchased', value: s ? peso(s.spentPrs) : '—' },
    { label: 'Expenses', value: s ? peso(s.spentExpenses) : '—' },
    { label: 'Total cost', value: s ? peso(s.spent) : '—' },
    { label: 'Selling price', value: s && s.sellingPrice != null ? peso(s.sellingPrice) : '—' },
    { label: 'Margin', value: s && s.margin !== null ? peso(s.margin) : '—',
      tone: s && s.margin !== null && s.margin < 0 ? 'text-red-600' : 'text-emerald-700' },
  ];
}
export function facilityExpenseStats(s: FacilitySpend | null): { label: string; value: string; tone?: string }[] {
  return [
    { label: 'Purchased', value: s ? peso(s.spentPrs) : '—' },
    { label: 'Expenses', value: s ? peso(s.spentExpenses) : '—' },
    { label: 'Total spent', value: s ? peso(s.spent) : '—' },
  ];
}

// ============================================================================
// FACILITIES screen. Presentational: the host (Accounting portal, or the Administrator dashboard's AdminFacilities)
// owns the lists, the spend and the modals, and is told what was clicked. `canManage` false hides New / Edit / Delete.
// ============================================================================
export function FacilitiesScreen({ api, facilities, facilitySpend, loading, canManage = true, onNew, onEdit, onDelete, onExpenses }: {
  api: Api; facilities: Facility[]; facilitySpend: Record<string, FacilitySpend> | null; loading: boolean; canManage?: boolean;
  onNew: () => void; onEdit: (f: Facility) => void; onDelete: (f: Facility) => void; onExpenses: (t: TargetRef) => void;
}) {
  return (
            <div className="space-y-4" data-screen="facilities">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Facilities</h2>
                  <p className="text-sm text-gray-500">Internal company facilities (equipment/items used internally, not client projects). A facility is a named category that purchase requests can be tagged to — they appear in the "For (Project)" picker under Facilities. Spent is the total of purchase requests charged to each.</p>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <ExportXlsxButton api={api} path="/reports/facilities/export" ids={facilities.map(f => f.id)} disabled={loading} />
                  {canManage && <button onClick={onNew} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Facility</button>}
                </div>
              </div>
              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : facilities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Building2 className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No facilities yet</p></div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            <th className="px-4 py-3">Facility</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Spent</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facilities.map(f => {
                            const fs = facilitySpend ? facilitySpend[f.id] ?? null : null;
                            const spent = facilitySpend ? (fs ? fs.spent : 0) : null;
                            return (
                              <tr key={f.id} data-facility-row={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{f.name}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 max-w-md">{f.description || '—'}</td>
                                <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap" data-spent>
                                  {spent === null ? <span className="font-normal text-gray-400">—</span> : <>
                                    <div>{peso(spent)}</div>
                                    {fs && fs.spentExpenses > 0 && <div className="text-xs font-normal text-gray-400">PRs {peso(fs.spentPrs)} · Exp. {peso(fs.spentExpenses)}</div>}
                                  </>}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button onClick={() => onExpenses({ kind: 'facility', id: f.id, name: f.name })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Receipt className="w-3.5 h-3.5" /> Expenses</button>
                                  {canManage && <button onClick={() => onEdit(f)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                                  {canManage && <button onClick={() => onDelete(f)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>
  );
}

// ============================================================================
// CONTRACT TRADING screen (Trading Deals). Presentational, like FacilitiesScreen.
// ============================================================================
export function TradingsScreen({ api, tradings, tradingSpend, rollupTradings, loading, canManage = true, rowFocus = null,
  newVoucherDisabled = false, onNew, onEdit, onDelete, onExpenses, onNewVoucher }: {
  api: Api; tradings: Trading[]; tradingSpend: Record<string, TradingSpend> | null; rollupTradings: BasisTotals | null;
  loading: boolean; canManage?: boolean; rowFocus?: string | null; newVoucherDisabled?: boolean;
  onNew: () => void; onEdit: (t: Trading) => void; onDelete: (t: Trading) => void; onExpenses: (t: TargetRef) => void; onNewVoucher: () => void;
}) {
  // The two dual-basis tables. Built by mapping the server's own figures into the shared panel's
  // shape — no arithmetic, just field selection, so the panel and the bars cannot disagree with the
  // numbers the endpoints returned.
  const tradingBasisRows: DualBasisRow[] = tradings.map(t => {
    const s = tradingSpend?.[t.id] ?? null;
    const zero: BasisFigures = { revenue: null, cost: 0, costPrs: 0, costExpenses: 0, profit: null, marginPercent: null };
    return {
      id: t.id, name: t.name, subtitle: t.client ?? null,
      price: s ? s.sellingPrice : t.sellingPrice ?? null,
      priceBasis: s ? s.sellingPriceVat : t.sellingPriceVat ?? 'inclusive',
      exVat: s ? s.exVat : zero, incVat: s ? s.incVat : zero,
    };
  });
  // The bars read the same payload the panel does, one strip per basis.
  const tradingBarRows = tradings.map(t => {
    const s = tradingSpend?.[t.id] ?? null;
    return {
      id: t.id, tradingId: t.id, name: t.name, client: t.client, status: t.status,
      spent: s ? s.spent : 0, spentPrs: s ? s.spentPrs : 0, spentExpenses: s ? s.spentExpenses : 0,
      sellingPrice: s ? s.sellingPrice : t.sellingPrice ?? null,
      margin: s ? s.margin : null, marginPercent: s ? s.marginPercent : null,
      exVat: s ? s.exVat : undefined, incVat: s ? s.incVat : undefined,
    };
  });
  return (
            <div className="space-y-4" data-screen="tradings">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Trading Deals</h2>
                  <p className="text-sm text-gray-500">Each trading deal is its own cost centre, like a project — purchase requests and expenses charged to it add up here. Cost is the total of its purchase requests plus its share of any expense. Set a selling price to see profit and margin; there is no budget. Margin updates as costs are logged, so it tightens until the deal is done.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
                  <ExportXlsxButton api={api} path="/reports/tradings/export" ids={tradings.map(t => t.id)} disabled={loading} />
                  {canManage && <button onClick={onNewVoucher} disabled={newVoucherDisabled} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"><Receipt className="w-4 h-4" /> New Voucher</button>}
                  {canManage && <button onClick={onNew} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Trading</button>}
                </div>
              </div>
              {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
                : tradings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400"><ArrowLeftRight className="w-10 h-10 mb-3 text-gray-300" /><p className="font-medium text-gray-500">No trading deals yet</p><p className="text-sm">Create one to start tracking what a trade cost.</p></div>
                ) : (
                  <>
                  {/* PROFIT on both VAT bases — the headline, above the table. Identical panel and
                      identical bars to the Project Allocation tab, from the same server figures, so
                      the two tabs cannot describe the same arithmetic differently. */}
                  <DualBasisProfit rows={tradingBasisRows} totals={rollupTradings} label="deal" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <TradingProfitBars rows={tradingBarRows} basis="exVat" />
                    <TradingProfitBars rows={tradingBarRows} basis="incVat" />
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            <th className="px-4 py-3">Trading</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Expected delivery</th>
                            <th className="px-4 py-3 text-right" title="As recorded: purchase-request cost is VAT-exclusive, logged expenses are VAT-inclusive receipts. The profit panel above restates this on each basis.">Cost <span className="normal-case font-normal text-gray-400">(as recorded)</span></th>
                            <th className="px-4 py-3 text-right">Selling price</th>
                            <th className="px-4 py-3 text-right" title="Selling price minus cost as recorded, i.e. the original mixed-basis figure. See the panel above for the like-for-like view.">Profit <span className="normal-case font-normal text-gray-400">(mixed basis)</span></th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tradings.map(t => {
                            const sp = tradingSpend?.[t.id] ?? null;
                            return (
                            <tr key={t.id} id={`row-${t.id}`} data-trading-row={t.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${rowFocus === t.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{t.name}</div>
                                {t.client && <div className="text-xs text-gray-400">{t.client}</div>}
                              </td>
                              <td className="px-4 py-3"><span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200">{t.status || 'Active'}</span></td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap text-gray-500" data-expected-date={t.id}>{t.expectedDeliveryDate ? new Date(t.expectedDeliveryDate + 'T00:00:00').toLocaleDateString() : '—'}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap" data-cost>
                                {sp ? (
                                  <>
                                    <div className="font-semibold text-gray-900">{peso(sp.spent)}</div>
                                    <div className="text-xs text-gray-400">PRs {peso(sp.spentPrs)} · Exp. {peso(sp.spentExpenses)}</div>
                                  </>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-900">
                                {t.sellingPrice != null ? (
                                  <>
                                    <div>{peso(t.sellingPrice)}</div>
                                    <div className="text-xs text-gray-400">
                                      {(VAT_BASIS_OPTIONS.find(o => o.value === (sp?.sellingPriceVat ?? t.sellingPriceVat ?? 'inclusive')) ?? VAT_BASIS_OPTIONS[0]).label}
                                    </div>
                                  </>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              {/* Profit only means something once a selling price is recorded; without
                                  one this says so rather than implying a loss equal to the whole cost.
                                  A price of 0 counts as unpriced too — the server returns null for both. */}
                              <td className="px-4 py-3 text-right whitespace-nowrap" data-profit>
                                {!sp || sp.margin === null ? <span className="text-xs text-gray-400">set selling price</span>
                                  : <>
                                      <div className={`font-semibold ${sp.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{peso(sp.margin)}</div>
                                      {sp.marginPercent !== null && (
                                        <div className={`text-xs font-medium ${sp.margin < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                          {sp.marginPercent < 0 ? '−' : ''}{Math.abs(sp.marginPercent).toFixed(1)}%{sp.margin < 0 ? ' loss' : ' margin'}
                                        </div>
                                      )}
                                    </>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button onClick={() => onExpenses({ kind: 'trading', id: t.id, name: t.name })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Receipt className="w-3.5 h-3.5" /> Expenses</button>
                                {canManage && <button onClick={() => onEdit(t)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                                {canManage && <button onClick={() => onDelete(t)} className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  </>
                )}
            </div>
  );
}
