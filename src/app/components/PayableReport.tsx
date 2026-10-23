// ============================================================================
// Payable Report — what Kimoel still owes each supplier, one row per purchase order.
//
// Everything on this screen is DERIVED by GET /api/payables from the PO and its non-voided voucher
// payments; nothing is stored, so a voided voucher puts a balance back with no second step and the
// report cannot disagree with the vouchers. The browser formats numbers and adds nothing up.
//
//   amount owed  = the PO's own total, VAT-inclusive as printed on the PO
//   balance      = owed - what non-voided vouchers have paid
//   status       = unpaid / partial / paid / overpaid   (overpaying is allowed, and shown in amber)
//   overdue      = past a due date the PO's terms actually state, with a balance
//
// View-only callers get the whole report; the "Pay" action (which opens the Disbursement Voucher
// with that PO pre-filled) is hidden for them, the same required-prop pattern the billing screens use.
// ============================================================================

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight, Coins, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { AllocationTag, AllocationFilter, matchesAllocation, type AllocType } from './AllocationTag';
import { ExportXlsxButton } from './ExportXlsxButton';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

export interface PayablePayment {
  paymentId: number; voucherId: number; serialNo: string | null; paidOn: string; amount: string;
  paymentMode: string | null; checkNo: string | null; voidedAt: string | null; voidReason: string | null;
}

export interface PayableRow {
  id: string; poNumber: string; supplier: string | null; supplierId: string | null;
  poDate: string; receivedDate: string | null; poStatus: string; unpayable: boolean;
  paymentTerms: string | null; poTotal: string; paidTotal: string; balance: string; overpaidAmount: string;
  paymentCount: number; status: 'unpaid' | 'partial' | 'paid' | 'overpaid' | string;
  overdue: boolean; dueDate: string | null; amountOverdue: string; payments: PayablePayment[];
  // What the order was bought for, resolved server-side from its purchase request.
  allocationType?: AllocType | null; allocationName?: string | null; allocationId?: string | null; allocationKey?: string | null;
}

interface Summary {
  count: number; outstanding: string; overdueCount: number; overdueAmount: string;
  overpaidCount: number; overpaidAmount: string;
  unpaidCount: number; partialCount: number; paidCount: number;
}

const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const peso = (n: number | string) =>
  `₱${(num(n)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MODE_LABEL: Record<string, string> = { cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', petty_cash: 'Petty cash' };

const FILTERS = [
  { id: 'all', label: 'All' }, { id: 'overdue', label: 'Overdue' }, { id: 'unpaid', label: 'Unpaid' },
  { id: 'partial', label: 'Partly paid' }, { id: 'paid', label: 'Paid' }, { id: 'overpaid', label: 'Overpaid' },
] as const;
type FilterId = typeof FILTERS[number]['id'];

// One badge per row, decided in one place. Overpaid is amber and carries the amount, so it can
// never be mistaken for the clean green "Paid"; overdue is red and wins over the unpaid/partial pill
// because it is the one thing this screen must not let slide past.
export function payableBadge(r: Pick<PayableRow, 'status' | 'overdue' | 'overpaidAmount' | 'amountOverdue'>) {
  const base = 'inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border';
  if (r.status === 'overpaid') {
    return <span title="More has been paid than is owed — check the voucher amounts" className={`${base} text-amber-700 bg-amber-50 border-amber-300`}>
      {`Overpaid −${peso(r.overpaidAmount)}`}</span>;
  }
  if (r.overdue) return <span title={`${peso(r.amountOverdue)} overdue`} className={`${base} text-red-700 bg-red-50 border-red-200`}>Overdue</span>;
  if (r.status === 'paid') return <span className={`${base} text-emerald-700 bg-emerald-50 border-emerald-200`}>Paid</span>;
  if (r.status === 'partial') return <span className={`${base} text-gray-700 bg-gray-100 border-gray-200`}>Partly paid</span>;
  return <span className={`${base} text-gray-700 bg-gray-100 border-gray-200`}>Unpaid</span>;
}

export function PayableReport({ api, isAdmin, onPay, reloadKey = 0 }: {
  api: Api;
  /** The caller's answer to "may this person pay a supplier" — derived from the permission matrix by
   *  whoever renders the screen, never from a role name in here. The server's requireRole is the real gate. */
  isAdmin: boolean;
  /** Opens the Disbursement Voucher with this PO pre-filled. */
  onPay?: (poId: string) => void;
  /** Bumped by the portal after a voucher is saved or voided, so this refreshes without a reload. */
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');
  const [supplierId, setSupplierId] = useState('');
  const [search, setSearch] = useState('');
  const [alloc, setAlloc] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // Suppliers for the dropdown come from the UNFILTERED set, so choosing one doesn't empty the list.
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter !== 'all') qs.set('status', filter);
      if (supplierId) qs.set('supplierId', supplierId);
      const r = await api<{ payables: PayableRow[]; summary: Summary }>(`/payables${qs.toString() ? `?${qs}` : ''}`);
      setRows(r.payables || []); setSummary(r.summary || null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load payables');
      setRows([]); setSummary(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter, supplierId, reloadKey]);

  useEffect(() => {
    api<{ payables: PayableRow[] }>('/payables').then(r => {
      const m = new Map<string, string>();
      for (const p of r.payables || []) if (p.supplierId && p.supplier) m.set(p.supplierId, p.supplier);
      setSuppliers([...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => { /* the dropdown simply stays short */ });
  }, [reloadKey]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => matchesAllocation(r, alloc))
      .filter(r => !q || `${r.poNumber} ${r.supplier || ''} ${r.allocationName || ''}`.toLowerCase().includes(q));
  }, [rows, search, alloc]);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Payable Report</h2>
          <p className="text-sm text-gray-500">
            What is still owed to each supplier, per purchase order — the PO total (VAT included, as printed) less what disbursement
            vouchers have paid against it. Paying a PO here is not project spend: its cost already counts through its purchase request.
          </p>
        </div>
        {/* The orders on screen, in screen order: the status chip, supplier, allocation and search all apply. */}
        <ExportXlsxButton api={api} path="/reports/payables/export" ids={visible.map(r => r.id)} disabled={loading} />
      </div>

      {summary && <PayableSummary summary={summary} />}

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Search PO no., supplier or project…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Supplier</span>
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]">
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Allocated to</span>
          <AllocationFilter rows={rows} value={alloc} onChange={setAlloc}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]" />
        </label>
        {(supplierId || filter !== 'all' || alloc) && (
          <button onClick={() => { setSupplierId(''); setFilter('all'); setAlloc(''); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${filter === f.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div> : (
        <PayableTable rows={visible} isAdmin={isAdmin} openId={open} onPay={onPay}
          onToggle={id => setOpen(open === id ? null : id)}
          emptyText={rows.length > 0 ? 'Nothing matches that search.' : filter !== 'all' || supplierId || alloc ? 'No purchase orders match these filters.' : 'No purchase orders yet.'} />
      )}
    </div>
  );
}

// The four headline numbers. Outstanding sums POSITIVE balances only: an overpaid order owes
// nothing, and letting its negative balance net off another supplier's debt would hide both.
export function PayableSummary({ summary }: { summary: Summary }) {
  const stat = (k: string, v: string, tone?: string, sub?: string) => (
    <div key={k} className="px-4 py-3" data-stat={k}>
      <p className="text-xs text-gray-400">{k}</p>
      <p className={`text-sm font-bold ${tone || 'text-gray-900'}`}>{v}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 flex flex-col sm:flex-row sm:flex-wrap">
      {stat('Purchase orders', String(summary.count))}
      {stat('Outstanding', peso(summary.outstanding), undefined, 'positive balances only')}
      {stat('Overdue', String(summary.overdueCount), summary.overdueCount > 0 ? 'text-red-600' : undefined,
        summary.overdueCount > 0 ? peso(summary.overdueAmount) : undefined)}
      {summary.overpaidCount > 0 &&
        stat('Overpaid', String(summary.overpaidCount), 'text-amber-700', `${peso(summary.overpaidAmount)} too much`)}
    </div>
  );
}

// The table. Pure: it renders the rows it is given, so every status can be rendered with a fixture.
export function PayableTable({ rows, isAdmin, openId, onToggle, onPay, emptyText }: {
  rows: PayableRow[]; isAdmin: boolean; openId: string | null;
  onToggle: (id: string) => void; onPay?: (poId: string) => void; emptyText: string;
}) {
  // The Actions column only exists for a manage caller, so every colSpan follows it.
  const COLS = isAdmin ? 11 : 10;
  return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-scroll max-w-full">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left">PO No.</th>
                  <th className="px-3 py-3 text-left">Supplier</th>
                  <th className="px-3 py-3 text-left">Allocated to</th>
                  <th className="px-3 py-3 text-left">PO date</th>
                  <th className="px-3 py-3 text-right">PO total</th>
                  <th className="px-3 py-3 text-right">Paid</th>
                  <th className="px-3 py-3 text-right">Balance</th>
                  <th className="px-3 py-3 text-left">Due date</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  {isAdmin && <th className="px-3 py-3 text-right sticky right-0 z-[2] bg-gray-50 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)]">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td className="px-4 py-10 text-center text-gray-400" colSpan={COLS}>
                    {emptyText}
                  </td></tr>
                ) : rows.map(r => {
                  const isOpen = openId === r.id;
                  const bal = num(r.balance);
                  return (
                    <Fragment key={r.id}>
                      {/* Overdue is the thing this screen must not let slide past, so the whole row carries it. */}
                      <tr className={r.overdue ? 'bg-red-50/60' : r.status === 'overpaid' ? 'bg-amber-50/50' : undefined}>
                        <td className="px-3 py-3 cursor-pointer text-gray-400" onClick={() => onToggle(r.id)}>
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-gray-900">{r.poNumber}</span>
                          {r.unpayable && <span className="ml-1.5 text-[10px] font-semibold uppercase text-gray-500 border border-gray-300 rounded px-1">{r.poStatus}</span>}
                        </td>
                        <td className="px-3 py-3 max-w-[170px]"><div className="truncate text-gray-900" title={r.supplier || ''}>{r.supplier || '—'}</div></td>
                        <td className="px-3 py-3 max-w-[190px]"><AllocationTag a={r} maxWidth={150} stacked /></td>
                        <td className="px-3 py-3 whitespace-nowrap text-gray-600">{r.poDate}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">{peso(r.poTotal)}</td>
                        <td className={`px-3 py-3 text-right whitespace-nowrap ${num(r.paidTotal) > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{peso(r.paidTotal)}</td>
                        <td className={`px-3 py-3 text-right whitespace-nowrap font-semibold ${r.overdue ? 'text-red-600' : bal < 0 ? 'text-amber-700' : 'text-gray-900'}`}>{peso(r.balance)}</td>
                        <td className={`px-3 py-3 whitespace-nowrap ${r.overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {r.dueDate || '—'}
                          {!r.dueDate && r.paymentTerms && <div className="text-[11px] text-gray-400 max-w-[170px] truncate" title={r.paymentTerms}>{r.paymentTerms}</div>}
                        </td>
                        <td className="px-3 py-3">{payableBadge(r)}</td>
                        {isAdmin && (
                          <td className={`px-3 py-3 text-right whitespace-nowrap sticky right-0 z-[1] shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)] ${r.overdue ? 'bg-red-50' : r.status === 'overpaid' ? 'bg-amber-50' : 'bg-white'}`}>
                            {!r.unpayable && onPay && (
                              <button onClick={() => onPay(r.id)} title="Pay this PO with a disbursement voucher"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                                <Coins className="w-3.5 h-3.5" /> Pay
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr>
                          <td className="px-6 py-3 bg-gray-50" colSpan={COLS}>
                            <p className="text-xs text-gray-500 mb-2">
                              {r.paymentTerms ? `Terms: ${r.paymentTerms}` : 'No payment terms on this PO'}
                              {r.receivedDate ? ` · received ${r.receivedDate}` : ' · not yet received'}
                              {r.status === 'overpaid' && <span className="text-amber-700"> · <AlertTriangle className="inline w-3 h-3 -mt-0.5" /> paid more than owed — check the vouchers below</span>}
                            </p>
                            {r.payments.length === 0 ? <p className="text-sm text-gray-400">No voucher has paid this PO yet.</p> : (
                              <table className="w-full text-xs">
                                <thead className="text-gray-400 uppercase"><tr>
                                  <th className="text-left py-1">Voucher</th><th className="text-left py-1">Paid on</th>
                                  <th className="text-left py-1">Mode</th><th className="text-right py-1">Amount</th><th className="text-left py-1 pl-4">Note</th>
                                </tr></thead>
                                <tbody>
                                  {r.payments.map(p => (
                                    <tr key={p.paymentId} className={p.voidedAt ? 'text-gray-400 line-through' : 'text-gray-800'}>
                                      <td className="py-1 font-mono font-semibold">{p.serialNo || `#${p.voucherId}`}</td>
                                      <td className="py-1">{p.paidOn}</td>
                                      <td className="py-1">{p.paymentMode ? MODE_LABEL[p.paymentMode] || p.paymentMode : '—'}{p.checkNo ? ` #${p.checkNo}` : ''}</td>
                                      <td className="py-1 text-right font-semibold">{peso(p.amount)}</td>
                                      <td className="py-1 pl-4 no-underline text-red-600" style={{ textDecoration: 'none' }}>{p.voidedAt ? `voided${p.voidReason ? `: ${p.voidReason}` : ''}` : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
  );
}
