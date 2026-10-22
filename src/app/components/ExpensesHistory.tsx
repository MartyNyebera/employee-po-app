// ============================================================================
// Disbursement Report — every disbursement voucher, newest first, as a reconciliation surface.
// (This is the Expenses History screen, extended: a voucher is the same record it always was, and now
// can also pay purchase orders, so there is one list of everything that went out, not two.)
//
// The point of this screen is to sit beside a physical folder of vouchers: you read EXP-2026-0007
// off a voucher, find it here, and check that what the system says it paid matches what is written
// on the paper. That is why the voucher number is the first column and why voided vouchers are shown
// rather than hidden — a voucher that was voided still exists physically, and someone holding the
// paper needs to be told it no longer counts rather than finding nothing at all.
//
// A voucher can carry two kinds of line: PO payments (a supplier invoice settled) and expenses (a
// direct cost charged to a project, trading deal or facility). Both are listed. Only the expense
// lines count as spend; the PO payments reduce what is owed on the PO and nothing else.
//
// View-only callers get the list, the detail and Print. New and Void are shown only when `isAdmin`
// says the caller may manage vouchers (the required-prop pattern the billing screens use); the
// server's requireRole is the real gate.
//
// NO MONEY MATH, with one exception. Every figure — each row's total, each line's amount, every
// summary total — arrives already summed by GET /api/expenses. The one sum made here is the table
// footer, which has to follow the search box (a browser-side filter the server cannot know about):
// it adds the shown, non-voided vouchers' totals in whole centavos.
// ============================================================================

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Receipt, Search, Ban, Split, X, Printer, Plus, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { printVoucher } from '../lib/voucherPrint';

export interface ExpenseHistoryAllocation {
  kind: 'project' | 'trading' | 'facility';
  targetId: string;
  name: string | null;
  amount: number;
}

export interface ExpenseHistoryPoPayment {
  id: number;
  purchaseOrderId: string;
  poNumber: string;
  supplier: string | null;
  poTotal: number;
  amount: number;
}

export interface ExpenseHistoryRow {
  expenseId: number;
  serialNo: string | null;
  expenseDate: string;
  description: string;
  amount: number;
  // This target's share, only when a target filter is active — the figure that ties to that
  // target's spend, as opposed to the voucher's full face value. null when unfiltered.
  allocatedHere: number | null;
  allocationCount: number;
  isSplit: boolean;
  targets: string | null;
  allocations: ExpenseHistoryAllocation[];
  // Payment details and PO-payment lines. Absent/empty on an expense-only voucher.
  paymentMode?: string | null;
  checkNo?: string | null;
  bank?: string | null;
  checkDate?: string | null;
  poPayments?: ExpenseHistoryPoPayment[];
  poPaymentCount?: number;
  payee?: string | null;
  referenceNo?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  status: 'active' | 'voided';
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
}

interface Summary {
  count: number;
  activeCount: number;
  voidedCount: number;
  activeTotal: number;
  voidedTotal: number;
  activeAllocatedTotal: number | null;
}

interface HistoryResponse {
  expenses: ExpenseHistoryRow[];
  summary: Summary;
}

export interface TargetOption { kind: 'project' | 'trading' | 'facility'; id: string; name: string }

const peso = (n: number) =>
  `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KIND_LABEL: Record<TargetOption['kind'], string> = { project: 'Project', trading: 'Trading', facility: 'Facility' };
// Spelled out rather than KIND_LABEL + 's', which produced "Facilitys".
const KIND_PLURAL: Record<TargetOption['kind'], string> = { project: 'Projects', trading: 'Tradings', facility: 'Facilities' };
const MODE_LABEL: Record<string, string> = { cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer' };

// "Check #1234" / "Cash" / "—": the mode column, with the check number where there is one.
export const modeText = (r: Pick<ExpenseHistoryRow, 'paymentMode' | 'checkNo'>) =>
  r.paymentMode ? `${MODE_LABEL[r.paymentMode] || r.paymentMode}${r.paymentMode === 'check' && r.checkNo ? ` #${r.checkNo}` : ''}` : '—';

const prettyDate = (ymd: string) => {
  // Parsed as UTC deliberately: a bare YYYY-MM-DD parsed as local time shifts a day backwards in
  // some zones, which would print the wrong voucher date.
  const d = new Date(`${ymd}T00:00:00Z`);
  return isNaN(d.getTime()) ? ymd
    : d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
};

export function ExpensesHistory({ api, targets, isAdmin, onNewVoucher, reloadKey = 0, onChanged }: {
  api: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  targets: TargetOption[];
  /** The caller's answer to "may this person manage vouchers" — derived from the permission matrix by
   *  whoever renders the screen, never from a role name in here. */
  isAdmin: boolean;
  /** Opens the Disbursement Voucher form. Only offered to a manage caller. */
  onNewVoucher?: () => void;
  /** Bumped by the portal after a voucher is saved, so the list refreshes without a reload. */
  reloadKey?: number;
  /** Called after a void, so the portal can refresh the spend figures that just changed. */
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ExpenseHistoryRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'voided'>('all');
  // Free-text narrowing of the loaded page only — voucher no., description, payee, PO no., supplier.
  // The filters that change WHICH rows exist are the server's; this one just helps the eye.
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ExpenseHistoryRow | null>(null);
  const [voiding, setVoiding] = useState<ExpenseHistoryRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (target) qs.set('target', target);
      if (status !== 'all') qs.set('status', status);
      const r = await api<HistoryResponse>(`/expenses${qs.toString() ? `?${qs}` : ''}`);
      setRows(r.expenses || []);
      setSummary(r.summary || null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load vouchers');
      setRows([]); setSummary(null);
    } finally { setLoading(false); }
  };
  // Re-queried on the server for every filter change, so the summary totals always describe the
  // same set of rows that is on screen.
  useEffect(() => { load(); }, [from, to, target, status, reloadKey]);

  const grouped = useMemo(() => {
    const by: Record<string, TargetOption[]> = { project: [], trading: [], facility: [] };
    for (const t of targets) by[t.kind].push(t);
    return by;
  }, [targets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [
      r.serialNo, r.description, r.payee, r.createdBy, r.targets, r.referenceNo, r.checkNo,
      ...(r.poPayments || []).flatMap(p => [p.poNumber, p.supplier]),
    ].some(v => (v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const filtered = !!(from || to || target || status !== 'all');
  const targetName = target ? targets.find(t => `${t.kind}:${t.id}` === target)?.name : null;

  const confirmVoid = async () => {
    if (!voiding) return;
    if (!reason.trim()) { toast.error('A reason is required to void a voucher'); return; }
    setBusy(true);
    try {
      await api(`/expenses/${voiding.expenseId}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      toast.success(`Voucher ${voiding.serialNo || voiding.expenseId} voided`);
      setVoiding(null); setDetail(null); setReason('');
      await load();
      onChanged?.();
    } catch (e: any) { toast.error('Void failed: ' + e.message); } finally { setBusy(false); }
  };

  const onPrint = (r: ExpenseHistoryRow) => {
    const res = printVoucher({
      serialNo: r.serialNo, expenseDate: r.expenseDate, payee: r.payee, description: r.description,
      referenceNo: r.referenceNo, paymentMode: r.paymentMode, checkNo: r.checkNo, bank: r.bank, checkDate: r.checkDate,
      amount: r.amount, createdBy: r.createdBy,
      poPayments: (r.poPayments || []).map(p => ({ poNumber: p.poNumber, supplier: p.supplier, amount: p.amount })),
      allocations: r.allocations.map(a => ({ name: a.name || a.targetId, kind: a.kind, amount: a.amount })),
      voidedAt: r.voidedAt, voidReason: r.voidReason,
    });
    if (!res.ok) toast.error(res.error || 'Could not open the print window');
  };

  const stat = (label: string, value: string, sub?: string, tone?: string) => (
    <div key={label} className="px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-bold ${tone || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Disbursement Report</h2>
          <p className="text-sm text-gray-500">
            Every disbursement voucher, with its EXP number, so a voucher in hand can be matched to the record. A voucher can pay
            suppliers (purchase orders), cover expenses, or both. Voided vouchers stay listed, struck through.
          </p>
        </div>
        {isAdmin && onNewVoucher && (
          <button onClick={onNewVoucher}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Disbursement Voucher
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Search voucher no., payee, description, PO no., supplier…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">From</span>
          <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">To</span>
          <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Charged to</span>
          <select value={target} onChange={e => setTarget(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]">
            <option value="">Anything</option>
            {(['project', 'trading', 'facility'] as const).map(k => grouped[k].length > 0 && (
              <optgroup key={k} label={KIND_PLURAL[k]}>
                {grouped[k].map(t => <option key={`${k}:${t.id}`} value={`${k}:${t.id}`}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Status</span>
          <select value={status} onChange={e => setStatus(e.target.value as any)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Active &amp; voided</option>
            <option value="active">Active only</option>
            <option value="voided">Voided only</option>
          </select>
        </label>
        {filtered && (
          <button onClick={() => { setFrom(''); setTo(''); setTarget(''); setStatus('all'); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Totals straight from the server, over the whole filtered set. Active and voided are never
          added together — a voided voucher counts toward nothing, and one grand total would put it
          quietly back in. */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 flex flex-col sm:flex-row sm:flex-wrap">
          {stat('Vouchers', String(summary.count), filtered ? 'matching the filters' : 'all time')}
          {stat('Paid out', peso(summary.activeTotal), `${summary.activeCount} active voucher${summary.activeCount === 1 ? '' : 's'}`)}
          {stat('Voided', peso(summary.voidedTotal), `${summary.voidedCount} voucher${summary.voidedCount === 1 ? '' : 's'}`,
            summary.voidedCount > 0 ? 'text-gray-400' : undefined)}
          {/* Only meaningful under a target filter: the vouchers' full value includes the shares
              charged elsewhere, so this is the part that actually hit this target. */}
          {summary.activeAllocatedTotal !== null &&
            stat(`Charged to ${targetName || 'this target'}`, peso(summary.activeAllocatedTotal), 'active vouchers only', 'text-blue-700')}
        </div>
      )}

      {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Receipt className="w-10 h-10 mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">{
              rows.length > 0 ? 'Nothing matches that search'
                : filtered ? 'No vouchers in this range'
                  : 'No vouchers yet'}</p>
            <p className="text-sm">{
              rows.length > 0 ? 'Clear the search box to see the rest.'
                : filtered ? 'Try widening the filters.'
                  : 'Vouchers appear here the moment they are saved.'}</p>
          </div>
        ) : (
          <VoucherTable rows={visible} onOpen={setDetail} />
        )}

      {detail && (
        <VoucherDetail detail={detail} isAdmin={isAdmin} onPrint={onPrint}
          onVoid={r => { setVoiding(r); setReason(''); }} onClose={() => setDetail(null)} />
      )}

      {voiding && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setVoiding(null); }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">Void voucher {voiding.serialNo}?</h3>
              <p className="mt-1 text-sm text-gray-500">{peso(voiding.amount)} — {voiding.description}</p>
            </div>
            <div className="p-5 space-y-2">
              {(voiding.poPayments || []).length > 0 && (
                <div className="p-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  This voucher pays {(voiding.poPayments || []).length} purchase order{(voiding.poPayments || []).length === 1 ? '' : 's'}
                  {' '}({(voiding.poPayments || []).map(p => p.poNumber).join(', ')}). Voiding it puts what was paid back on each as <strong>still owed</strong>.
                </div>
              )}
              {voiding.allocations.length > 0 && (
                <div className="p-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  Its {voiding.allocations.length === 1 ? 'expense line' : `${voiding.allocations.length} expense lines`} stop counting as spend
                  {voiding.targets ? ` (${voiding.targets})` : ''}.
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
              <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
                placeholder="e.g. Check bounced — reissued on the next voucher"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <p className="text-xs text-gray-400">The voucher stays on file, struck through. Nothing is deleted.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setVoiding(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={confirmVoid} disabled={busy || !reason.trim()} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{busy ? 'Voiding…' : 'Void voucher'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One voucher's lines in one flat list: PO payments first, then expense allocations. `key` is what makes
// two lines "the same target" (one PO, or one project/trading/facility).
export interface ChargeLine { key: string; label: string; type: string; amount: number }
export function chargeLines(r: ExpenseHistoryRow): ChargeLine[] {
  return [
    ...(r.poPayments || []).map(p => ({
      key: `po:${p.purchaseOrderId}`, label: `PO ${p.poNumber}${p.supplier ? ` · ${p.supplier}` : ''}`, type: 'PO payment', amount: p.amount,
    })),
    ...r.allocations.map(a => ({
      key: `${a.kind}:${a.targetId}`, label: a.name || a.targetId, type: KIND_LABEL[a.kind] || a.kind, amount: a.amount,
    })),
  ];
}

// The Charged-to cell as ONE line: "Target" or "Target (n lines)" when every line is the same target;
// otherwise the first target plus "+n more" (n = the other distinct targets). The first label is
// ellipsised by the cell; the suffix never is. `full` is the whole list, for the hover title.
export function chargedToSummary(r: ExpenseHistoryRow): { first: string; suffix: string; full: string } {
  const lines = chargeLines(r);
  if (lines.length === 0) return { first: '', suffix: '', full: '' };
  const distinct = new Set(lines.map(l => l.key)).size;
  const full = lines.map(l => `${l.label} — ${peso(l.amount)}`).join('\n');
  if (distinct === 1) return { first: lines[0].label, suffix: lines.length > 1 ? `(${lines.length} lines)` : '', full };
  return { first: lines[0].label, suffix: `+${distinct - 1} more`, full };
}

// The voucher rows. Pure: renders the rows it is given, so every kind of voucher (expense-only,
// PO-only, mixed, check, voided) can be rendered from a fixture. Every row is ONE line tall however
// many split lines the voucher has; the breakdown lives in the expanded row (click the row or the
// chevron). The footer adds up the vouchers shown, voided ones excluded, in whole centavos.
export function VoucherTable({ rows, onOpen }: { rows: ExpenseHistoryRow[]; onOpen: (r: ExpenseHistoryRow) => void }) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpenIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const COLS = 9;
  const live = rows.filter(r => r.status !== 'voided');
  const liveCentavos = live.reduce((n, r) => n + Math.round((Number(r.amount) || 0) * 100), 0);
  return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-scroll max-w-full">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="pl-3 pr-1 py-3 w-6"></th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Voucher No.</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Date</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Payee</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Description</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Charged to</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Mode</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Total</th>
                    <th className="pl-3 pr-6 py-3 text-left whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => {
                    const voided = r.status === 'voided';
                    const isOpen = openIds.has(r.expenseId);
                    const lines = chargeLines(r);
                    const cs = chargedToSummary(r);
                    const dim = voided ? 'text-gray-400' : 'text-gray-600';
                    return (
                      <Fragment key={r.expenseId}>
                      <tr onClick={() => toggle(r.expenseId)} className="hover:bg-gray-50 cursor-pointer" title="Show the breakdown">
                        <td className="pl-3 pr-1 py-3 text-gray-400">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`font-mono text-xs font-semibold ${voided ? 'text-gray-400' : 'text-gray-900'}`}>
                            {r.serialNo || '—'}
                          </span>
                        </td>
                        <td className={`px-3 py-3 whitespace-nowrap ${dim}`}>{prettyDate(r.expenseDate)}</td>
                        <td className="px-3 py-3 max-w-[150px]">
                          <div className={`truncate whitespace-nowrap ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`} title={r.payee || undefined}>{r.payee || '—'}</div>
                        </td>
                        <td className="px-3 py-3 max-w-[190px]">
                          <div className={`truncate whitespace-nowrap ${voided ? 'text-gray-400 line-through' : 'text-gray-700'}`} title={r.description}>{r.description}</div>
                        </td>
                        <td className="px-3 py-3 max-w-[250px]" title={cs.full || undefined}>
                          {lines.length === 0 ? <span className="text-gray-400">—</span> : (
                            <div className={`flex items-center gap-1.5 text-xs ${dim} ${voided ? 'line-through' : ''}`}>
                              {r.isSplit && <Split className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                              <span className="truncate whitespace-nowrap min-w-0">{cs.first}</span>
                              {cs.suffix && <span className="whitespace-nowrap flex-shrink-0 text-gray-400">{cs.suffix}</span>}
                            </div>
                          )}
                        </td>
                        <td className={`px-3 py-3 whitespace-nowrap text-xs ${dim}`}>{modeText(r)}</td>
                        <td className={`px-3 py-3 text-right whitespace-nowrap font-semibold ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {/* Under a target filter, the voucher total is not the amount that hit that
                              target, so the share is spelled out instead of being inferred. Inline, so
                              the row stays one line. */}
                          {r.allocatedHere !== null && r.allocatedHere !== r.amount && (
                            <span className="mr-2 text-[11px] font-medium text-blue-600 no-underline">{peso(r.allocatedHere)} here</span>
                          )}
                          {peso(r.amount)}
                        </td>
                        <td className="pl-3 pr-6 py-3 whitespace-nowrap">
                          {voided ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" title={r.voidReason || undefined}>
                              <Ban className="w-3.5 h-3.5" /> Voided
                            </span>
                          ) : <span className="text-xs font-semibold text-emerald-700">Active</span>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50">
                          <td colSpan={COLS} className="px-6 py-3">
                            {lines.length === 0 ? <p className="text-xs text-gray-400">This voucher has no lines.</p> : (
                              <table className="text-xs w-full max-w-2xl">
                                <thead className="text-gray-400 uppercase"><tr>
                                  <th className="text-left py-1 pr-4 font-semibold">Charged to</th>
                                  <th className="text-left py-1 pr-4 font-semibold">Type</th>
                                  <th className="text-right py-1 font-semibold">Amount</th>
                                </tr></thead>
                                <tbody>
                                  {lines.map((l, i) => (
                                    <tr key={i} className={voided ? 'text-gray-400 line-through' : 'text-gray-800'}>
                                      <td className="py-1 pr-4">{l.label}</td>
                                      <td className="py-1 pr-4 whitespace-nowrap">{l.type}</td>
                                      <td className="py-1 text-right whitespace-nowrap">{peso(l.amount)}</td>
                                    </tr>
                                  ))}
                                  <tr className="border-t border-gray-300 font-semibold text-gray-900">
                                    <td className="py-1 pr-4" colSpan={2}>Voucher total</td>
                                    <td className="py-1 text-right whitespace-nowrap">{peso(r.amount)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            )}
                            <button type="button" onClick={e => { e.stopPropagation(); onOpen(r); }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-100">
                              <FileText className="w-3.5 h-3.5" /> Open voucher
                            </button>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-900">
                    <td className="px-3 py-3 text-xs" colSpan={COLS - 2}>
                      Total of the {live.length} active voucher{live.length === 1 ? '' : 's'} shown
                      {rows.length !== live.length && <span className="font-normal text-gray-400"> · {rows.length - live.length} voided not counted</span>}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{peso(liveCentavos / 100)}</td>
                    <td className="pr-6"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
  );
}

// One voucher in full: payment details, the POs it paid, what it was charged to. Print is open to
// everyone who can see the voucher; Void only to a manage caller, and only while it is still active.
export function VoucherDetail({ detail, isAdmin, onPrint, onVoid, onClose }: {
  detail: ExpenseHistoryRow; isAdmin: boolean;
  onPrint: (r: ExpenseHistoryRow) => void; onVoid: (r: ExpenseHistoryRow) => void; onClose: () => void;
}) {
  return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
              <div>
                <p className="font-mono text-sm font-bold text-gray-900">{detail.serialNo || `Voucher #${detail.expenseId}`}</p>
                <p className="text-xs text-gray-400">{prettyDate(detail.expenseDate)}</p>
              </div>
              <button onClick={() => onClose()} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Description</p>
                <p className="text-gray-900">{detail.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-400">Total paid</p><p className="font-semibold text-gray-900">{peso(detail.amount)}</p></div>
                <div><p className="text-xs text-gray-400">Entered by</p><p className="text-gray-900">{detail.createdBy || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Paid to</p><p className="text-gray-900">{detail.payee || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Reference</p><p className="text-gray-900">{detail.referenceNo || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Payment mode</p><p className="text-gray-900">{modeText(detail)}</p></div>
                {detail.paymentMode === 'check' && (
                  <div><p className="text-xs text-gray-400">Bank / check date</p>
                    <p className="text-gray-900">{[detail.bank, detail.checkDate ? prettyDate(detail.checkDate) : ''].filter(Boolean).join(' · ') || '—'}</p></div>
                )}
              </div>

              {(detail.poPayments || []).length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Purchase orders paid</p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {(detail.poPayments || []).map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-gray-900 font-mono text-xs font-semibold">{p.poNumber}</p>
                          <p className="text-[11px] text-gray-400 truncate">{p.supplier || 'Unknown supplier'} · PO total {peso(p.poTotal)}</p>
                        </div>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">{peso(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Settling a PO is not project spend — its cost already counts through its purchase request.</p>
                </div>
              )}

              {detail.allocations.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">
                    Expenses — charged to{detail.isSplit ? `, split ${detail.allocationCount} ways` : ''}
                  </p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {detail.allocations.map((a, i) => (
                      <div key={`${a.kind}:${a.targetId}:${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-gray-900 truncate">{a.name || a.targetId}</p>
                          <p className="text-[11px] text-gray-400">{KIND_LABEL[a.kind]}</p>
                        </div>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">{peso(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.status === 'voided' && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> Voided — counts as no payment and no spend</p>
                  <p className="text-xs text-red-700 mt-1">{detail.voidReason || 'No reason recorded'}</p>
                  <p className="text-[11px] text-red-600 mt-0.5">
                    {detail.voidedBy || 'Unknown'}{detail.voidedAt ? ` · ${new Date(detail.voidedAt).toLocaleString()}` : ''}
                  </p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <button onClick={() => onPrint(detail)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                  <Printer className="w-4 h-4" /> Print
                </button>
                {isAdmin && detail.status === 'active' && (
                  <button onClick={() => onVoid(detail)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 text-red-700 rounded-lg hover:bg-red-50">
                    <Ban className="w-4 h-4" /> Void
                  </button>
                )}
              </div>
              <button onClick={() => onClose()} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
  );
}
