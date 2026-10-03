// ============================================================================
// Expenses History — every expense voucher, newest first, as a reconciliation surface.
//
// The point of this screen is to sit beside a physical folder of vouchers: you read EXP-2026-0007
// off a receipt, find it here, and check that what the system says it was charged to matches what
// is written on the paper. That is why the serial is the first column and why voided vouchers are
// shown rather than hidden — a voucher that was voided still exists physically, and someone holding
// the paper needs to be told it no longer counts rather than finding nothing at all.
//
// READ-ONLY by design. Voiding stays on the per-target expense list, next to the share it affects,
// so an accidental void from a long scrolling history is not possible here.
//
// NO MONEY MATH. Every figure — each row's total, each allocation's share, every summary total —
// arrives already summed by GET /api/expenses. This file formats numbers and never adds them.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Receipt, Search, Ban, Split, X } from 'lucide-react';
import { toast } from 'sonner';

export interface ExpenseHistoryAllocation {
  kind: 'project' | 'trading' | 'facility';
  targetId: string;
  name: string | null;
  amount: number;
}

export interface ExpenseHistoryRow {
  expenseId: number;
  serialNo: string | null;
  expenseDate: string;
  description: string;
  amount: number;
  // This target's share, only when a target filter is active — the figure that ties to that
  // target's spend, as opposed to the receipt's full face value. null when unfiltered.
  allocatedHere: number | null;
  allocationCount: number;
  isSplit: boolean;
  targets: string | null;
  allocations: ExpenseHistoryAllocation[];
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

const prettyDate = (ymd: string) => {
  // Parsed as UTC deliberately: a bare YYYY-MM-DD parsed as local time shifts a day backwards in
  // some zones, which would print the wrong voucher date.
  const d = new Date(`${ymd}T00:00:00Z`);
  return isNaN(d.getTime()) ? ymd
    : d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
};

export function ExpensesHistory({ api, targets }: {
  api: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  targets: TargetOption[];
}) {
  const [rows, setRows] = useState<ExpenseHistoryRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'voided'>('all');
  // Free-text narrowing of the loaded page only — serial, description, payee, who entered it. The
  // filters that change WHICH rows exist are the server's; this one just helps the eye.
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ExpenseHistoryRow | null>(null);

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
      toast.error(e.message || 'Failed to load expenses');
      setRows([]); setSummary(null);
    } finally { setLoading(false); }
  };
  // Re-queried on the server for every filter change, so the summary totals always describe the
  // same set of rows that is on screen.
  useEffect(() => { load(); }, [from, to, target, status]);

  const grouped = useMemo(() => {
    const by: Record<string, TargetOption[]> = { project: [], trading: [], facility: [] };
    for (const t of targets) by[t.kind].push(t);
    return by;
  }, [targets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.serialNo, r.description, r.payee, r.createdBy, r.targets, r.referenceNo]
      .some(v => (v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const filtered = !!(from || to || target || status !== 'all');
  const targetName = target ? targets.find(t => `${t.kind}:${t.id}` === target)?.name : null;

  const stat = (label: string, value: string, sub?: string, tone?: string) => (
    <div key={label} className="px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-bold ${tone || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Expenses History</h2>
        <p className="text-sm text-gray-500">
          Every expense voucher ever logged, with its EXP number, so a receipt in hand can be matched
          to the record. One voucher per receipt — a receipt split across two projects still has a
          single number. Read-only; void an expense from the target it was charged to.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Search EXP #, description, payee…" value={search} onChange={e => setSearch(e.target.value)}
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
          {stat('Active', peso(summary.activeTotal), `${summary.activeCount} voucher${summary.activeCount === 1 ? '' : 's'}`)}
          {stat('Voided', peso(summary.voidedTotal), `${summary.voidedCount} voucher${summary.voidedCount === 1 ? '' : 's'}`,
            summary.voidedCount > 0 ? 'text-gray-400' : undefined)}
          {/* Only meaningful under a target filter: the receipts' full value includes the shares
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
                : filtered ? 'No expenses in this range'
                  : 'No expenses logged'}</p>
            <p className="text-sm">{
              rows.length > 0 ? 'Clear the search box to see the rest.'
                : filtered ? 'Try widening the filters.'
                  : 'Expenses appear here the moment they are logged.'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Voucher</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-left">Charged to</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Entered by</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map(r => {
                    const voided = r.status === 'voided';
                    return (
                      <tr key={r.expenseId} onClick={() => setDetail(r)}
                        className="hover:bg-gray-50 cursor-pointer" title="View this voucher">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`font-mono text-xs font-semibold ${voided ? 'text-gray-400' : 'text-gray-900'}`}>
                            {r.serialNo || '—'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap ${voided ? 'text-gray-400' : 'text-gray-600'}`}>{prettyDate(r.expenseDate)}</td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className={`truncate ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`} title={r.description}>{r.description}</div>
                          {r.payee && <div className="text-xs text-gray-400 truncate">{r.payee}</div>}
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="flex items-start gap-1.5">
                            {r.isSplit && (
                              <span title={`One receipt split ${r.allocationCount} ways`} className="flex-shrink-0 mt-0.5">
                                <Split className="w-3.5 h-3.5 text-blue-500" />
                              </span>
                            )}
                            <div className={`text-xs ${voided ? 'text-gray-400' : 'text-gray-600'}`}>
                              {r.allocations.length === 0 ? <span className="text-gray-400">—</span>
                                : r.allocations.map((a, i) => (
                                  <span key={`${a.kind}:${a.targetId}:${i}`}>
                                    {i > 0 && <span className="text-gray-300"> · </span>}
                                    <span className="font-medium">{a.name || a.targetId}</span>{' '}
                                    <span className="whitespace-nowrap">{peso(a.amount)}</span>
                                  </span>
                                ))}
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right whitespace-nowrap font-semibold ${voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {peso(r.amount)}
                          {/* Under a target filter, the receipt total is not the amount that hit that
                              target, so the share is spelled out instead of being inferred. */}
                          {r.allocatedHere !== null && r.allocatedHere !== r.amount && (
                            <div className="text-[11px] font-medium text-blue-600">{peso(r.allocatedHere)} here</div>
                          )}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-xs ${voided ? 'text-gray-400' : 'text-gray-600'}`}>{r.createdBy || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {voided ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" title={r.voidReason || undefined}>
                              <Ban className="w-3.5 h-3.5" /> Voided
                            </span>
                          ) : <span className="text-xs font-semibold text-emerald-700">Active</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
              <div>
                <p className="font-mono text-sm font-bold text-gray-900">{detail.serialNo || `Expense #${detail.expenseId}`}</p>
                <p className="text-xs text-gray-400">{prettyDate(detail.expenseDate)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Description</p>
                <p className="text-gray-900">{detail.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-400">Total</p><p className="font-semibold text-gray-900">{peso(detail.amount)}</p></div>
                <div><p className="text-xs text-gray-400">Entered by</p><p className="text-gray-900">{detail.createdBy || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Payee</p><p className="text-gray-900">{detail.payee || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Reference</p><p className="text-gray-900">{detail.referenceNo || '—'}</p></div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">
                  Charged to{detail.isSplit ? ` — split ${detail.allocationCount} ways` : ''}
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
              {detail.status === 'voided' && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> Voided — counts toward no spend</p>
                  <p className="text-xs text-red-700 mt-1">{detail.voidReason || 'No reason recorded'}</p>
                  <p className="text-[11px] text-red-600 mt-0.5">
                    {detail.voidedBy || 'Unknown'}{detail.voidedAt ? ` · ${new Date(detail.voidedAt).toLocaleString()}` : ''}
                  </p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
              <button onClick={() => setDetail(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
