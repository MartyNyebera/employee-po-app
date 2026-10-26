// ============================================================================
// Accounting OVERVIEW SYSTEM — the portal's landing screen.
//
// Everything on it comes from GET /api/accounting/overview, computed server-side ("today" is Asia/Manila);
// the browser only formats and routes clicks. Read-only: it has no action buttons, so a view-only caller sees
// exactly what an admin sees.
//
//   alert strip   counts by type (overdue red, due today amber, upcoming neutral); each opens its list
//   five cards    each opens its report
//   no-due-date   collapsible; each item links to where the date is entered
//   daily pop-up  first Overview load of the day, "Got it" hides it until tomorrow (localStorage, never required)
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, X } from 'lucide-react';
import { peso, shortDate } from '../lib/overviewFormat';
import { OverviewCalendar, Next14, type CalendarData, type Next14Data } from './OverviewCalendar';
import { OverviewCharts, type ChartsData } from './OverviewCharts';

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

export interface OverviewLink { view: string; id?: string | number; search?: string }
export type AlertType = 'receivable' | 'payable' | 'project' | 'trading' | 'payday';
export type Severity = 'overdue' | 'today' | 'upcoming';

export interface OverviewAlert {
  id: string; type: AlertType; severity: Severity; title: string; subtitle: string; date: string;
  amount: string | null; days: number; daysLeft: number; daysLate: number; link: OverviewLink;
}
export type SalesPeriod = 'month' | 'year' | 'active';
export interface SalesRow { kind: 'project' | 'trading'; id: string; name: string; status: string; contractDate: string; dateBasis?: string; value?: string; billed: string; notBilled?: string; link: OverviewLink }
export interface SalesPeriodData {
  amount: string; billed: string; notBilled: string; count: number; unpricedDeals: number; unpricedProjects: number;
  rows: SalesRow[]; unpriced: SalesRow[];
}
export interface TotalSalesData { default: SalesPeriod; periods: Record<SalesPeriod, SalesPeriodData>; dateRule: string }
export const PERIOD_LABEL: Record<SalesPeriod, string> = { month: 'This month', year: 'This year', active: 'All active' };
export interface NoDueItem { type: AlertType; id: string; title: string; subtitle: string; amount: string | null; link: OverviewLink }
interface Counts { overdue: number; today: number; upcoming: number; total: number }

export interface OverviewData {
  today: string; month: string;
  cards: {
    totalSales: TotalSalesData;
    receivables: { outstanding: string; overdue: string; overdueCount: number; openCount: number; view: string };
    payables: { outstanding: string; overdue: string; overdueCount: number; openCount: number; view: string };
    collected: { amount: string; count: number; from: string; to: string; view: string };
    disbursed: { amount: string; count: number; from: string; to: string; view: string };
    pcf: { configured: boolean; balance: string | null; balanceNegative: boolean; view: string };
  };
  alerts: OverviewAlert[];
  counts: Record<AlertType, Counts>;
  totals: Counts;
  noDueDate: NoDueItem[];
  calendar: CalendarData; next14: Next14Data; charts: ChartsData;
  horizonDays: number; paydayDays: number;
}

export const TYPE_LABEL: Record<AlertType, string> = {
  receivable: 'Receivables', payable: 'Payables', project: 'Projects', trading: 'Trading deals', payday: 'Payday',
};
const TYPE_ORDER: AlertType[] = ['receivable', 'payable', 'project', 'trading', 'payday'];

export { peso, shortDate };

/** "3 days late" / "due today" / "in 5 days" — decided from the server's signed day count. */
export function whenText(a: Pick<OverviewAlert, 'severity' | 'days' | 'type'>): string {
  if (a.severity === 'overdue') return `${-a.days} day${-a.days === 1 ? '' : 's'} late`;
  if (a.severity === 'today') return a.type === 'payday' ? 'today' : 'due today';
  return `in ${a.days} day${a.days === 1 ? '' : 's'}`;
}
export const SEV_STYLE: Record<Severity, string> = {
  overdue: 'text-red-700 bg-red-50 border-red-200', today: 'text-amber-700 bg-amber-50 border-amber-200', upcoming: 'text-gray-700 bg-gray-50 border-gray-200',
};

// ---- the once-a-day pop-up memory. Every storage access is wrapped: with storage blocked the screen still works
// (it just remembers for this page load only).
const memDismissed = new Set<string>();
const popKey = (userKey: string) => `kimoel.accounting.overview.popup.${userKey}`;
function popupSeenToday(userKey: string, today: string): boolean {
  if (memDismissed.has(popKey(userKey) + today)) return true;
  try { return localStorage.getItem(popKey(userKey)) === today; } catch { return false; }
}
function rememberPopup(userKey: string, today: string) {
  memDismissed.add(popKey(userKey) + today);
  try { localStorage.setItem(popKey(userKey), today); } catch { /* storage blocked: remembered for this load only */ }
}

export function AccountingOverview({ api, userKey, onOpen }: {
  api: Api;
  /** Who is looking, so the pop-up is remembered per user per browser. */
  userKey: string;
  onOpen: (link: OverviewLink) => void;
}) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');
  const [listType, setListType] = useState<AlertType | 'all' | null>(null);
  const [noDueOpen, setNoDueOpen] = useState(false);
  const [popup, setPopup] = useState(false);
  // Total Sales card: which period it shows, and whether its breakdown is open.
  const [period, setPeriod] = useState<SalesPeriod>('month');
  const [breakdown, setBreakdown] = useState(false);
  // The month on the calendar. Changing it asks the same endpoint for that month; only its calendar part is used.
  const [calMonth, setCalMonth] = useState<string | null>(null);
  const [cal, setCal] = useState<CalendarData | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [selDay, setSelDay] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    api<OverviewData>('/accounting/overview')
      .then(r => {
        if (off) return;
        setData(r); setError('');
        if (r.totals.total > 0 && !popupSeenToday(userKey, r.today)) setPopup(true);
      })
      .catch(e => { if (!off) setError(e.message || 'Could not load the overview'); });
    return () => { off = true; };
  }, []);

  const goMonth = (ym: string) => {
    setCalMonth(ym); setSelDay(null); setCalLoading(true);
    api<OverviewData>(`/accounting/overview?month=${ym}`)
      .then(r => setCal(r.calendar))
      .catch(e => setError(e.message || 'Could not load that month'))
      .finally(() => setCalLoading(false));
  };

  const shown = useMemo(() => (data && listType ? data.alerts.filter(a => listType === 'all' || a.type === listType) : []), [data, listType]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>;

  const c = data.cards;
  const open = (l: OverviewLink) => { setPopup(false); onOpen(l); };
  const gotIt = () => { rememberPopup(userKey, data.today); setPopup(false); };

  // Every card has the same structure and sizes (label · figure · two-line subline), so the figures share a baseline
  // across a row and all the cards are the same height.
  const card = (key: string, title: string, big: string, sub: React.ReactNode, link: OverviewLink, tone?: string) => (
    <button key={key} type="button" data-card={key} onClick={() => onOpen(link)}
      className="h-full min-w-0 flex flex-col text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition">
      <span className="flex items-center min-h-[22px] text-xs font-medium text-gray-400 leading-4">{title}</span>
      <span data-figure className={`mt-1 text-2xl leading-8 font-bold tabular-nums truncate ${tone || 'text-gray-900'}`}>{big}</span>
      <span className="mt-1 text-[11px] leading-4 text-gray-400 min-h-[32px]">{sub}</span>
    </button>
  );
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // One page grid: 24px between sections, 16px inside them.
  return (
    <div className="flex flex-col gap-[24px]" data-overview>
      <div>
        <h2 className="font-semibold text-gray-900">Overview</h2>
        <p className="text-sm text-gray-500">What needs attention today, {shortDate(data.today)}.</p>
      </div>

      {/* ---- 1. alert strip (and the list a chip opens) ---- */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" data-alert-strip>
          {TYPE_ORDER.map(t => {
            const n = data.counts[t];
            return (
              <button key={t} type="button" data-strip={t} onClick={() => setListType(listType === t ? null : t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 ${listType === t ? 'border-gray-900' : 'border-gray-200'}`}>
                <span className="font-medium text-gray-800">{TYPE_LABEL[t]}</span>
                {n.total === 0 ? <span className="text-xs text-gray-300">none</span> : (
                  <span className="flex items-center gap-1">
                    {n.overdue > 0 && <span data-sev="overdue" className="px-1.5 py-px rounded-full text-xs font-bold text-red-700 bg-red-50 border border-red-200">{n.overdue} overdue</span>}
                    {n.today > 0 && <span data-sev="today" className="px-1.5 py-px rounded-full text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200">{n.today} today</span>}
                    {n.upcoming > 0 && <span data-sev="upcoming" className="px-1.5 py-px rounded-full text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200">{n.upcoming} soon</span>}
                  </span>
                )}
              </button>
            );
          })}
          {data.totals.total > 0 && (
            <button type="button" data-strip="all" onClick={() => setListType(listType === 'all' ? null : 'all')}
              className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50">
              All {data.totals.total}
            </button>
          )}
        </div>

        {listType && (
          <div className="bg-white rounded-xl border border-gray-200" data-alert-list>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">{listType === 'all' ? 'All alerts' : TYPE_LABEL[listType]} <span className="font-normal text-gray-400">· {shown.length}</span></p>
              <button type="button" onClick={() => setListType(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-md" aria-label="Close list"><X className="w-4 h-4" /></button>
            </div>
            {shown.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">Nothing needs attention here.</p> : <AlertRows alerts={shown} onOpen={open} showType={listType === 'all'} />}
          </div>
        )}
      </div>

      {/* ---- 2. cards: three to a row on a wide screen, two on a tablet, one on a phone; all the same height ---- */}
      <div className="[display:grid] sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" data-cards>
        {(() => {
          const ts = c.totalSales.periods[period];
          const noteBtn = (n: number, one: string, view: string, key: string) => n > 0 && (
            <button type="button" data-unpriced={key} onClick={e => { e.stopPropagation(); onOpen({ view }); }} className="text-amber-700 underline hover:text-amber-800">
              {n} {one}{n === 1 ? '' : 's'} not priced yet</button>);
          return (
            <div data-card="totalSales" role="button" tabIndex={0} onClick={() => setBreakdown(true)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBreakdown(true); } }}
              className="h-full min-w-0 flex flex-col text-left bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition">
              <span className="flex items-center min-h-[22px] text-xs font-medium text-gray-400 leading-4">Total Sales</span>
              <span data-figure className="mt-1 text-2xl leading-8 font-bold tabular-nums truncate text-gray-900">{peso(ts.amount)}</span>
              <span className="mt-1 text-[11px] leading-4 text-gray-400 min-h-[32px]" data-sales-sub>
                <span data-billed>Billed {peso(ts.billed)}</span> · <span data-notbilled>Not yet billed {peso(ts.notBilled)}</span>
                {(ts.unpricedDeals > 0 || ts.unpricedProjects > 0) && (
                  <span className="block">{noteBtn(ts.unpricedDeals, 'deal', 'tradings', 'deals')}{ts.unpricedDeals > 0 && ts.unpricedProjects > 0 && ' · '}{noteBtn(ts.unpricedProjects, 'project', 'projects', 'projects')}</span>
                )}
              </span>
              {/* the period toggle sits on the card's bottom edge, full width, so it never competes with the label for room */}
              <span className="mt-auto pt-3 flex w-full rounded-md" data-period-toggle>
                <span className="flex w-full rounded-md border border-gray-200 overflow-hidden">
                  {(['month', 'year', 'active'] as SalesPeriod[]).map(p => (
                    <button key={p} type="button" data-period={p} aria-pressed={period === p} onClick={e => { e.stopPropagation(); setPeriod(p); }}
                      className={`crm-seg-btn flex-1 px-1 py-1 text-[11px] leading-4 font-medium whitespace-nowrap ${period === p ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{PERIOD_LABEL[p]}</button>
                  ))}
                </span>
              </span>
            </div>
          );
        })()}
        {card('receivables', 'Receivables outstanding', peso(c.receivables.outstanding),
          c.receivables.overdueCount > 0 ? <span className="text-red-600">{peso(c.receivables.overdue)} overdue · {c.receivables.overdueCount}</span> : `${c.receivables.openCount} open · none overdue`,
          { view: c.receivables.view })}
        {card('payables', 'Payables outstanding', peso(c.payables.outstanding),
          c.payables.overdueCount > 0 ? <span className="text-red-600">{peso(c.payables.overdue)} overdue · {c.payables.overdueCount}</span> : `${c.payables.openCount} open · none overdue`,
          { view: c.payables.view })}
        {card('collected', 'Collected this month', peso(c.collected.amount), plural(c.collected.count, 'payment'), { view: c.collected.view })}
        {card('disbursed', 'Disbursed this month', peso(c.disbursed.amount), `${plural(c.disbursed.count, 'voucher')} · petty cash included`, { view: c.disbursed.view })}
        {card('pcf', 'PCF current balance', c.pcf.configured ? peso(c.pcf.balance) : '—', c.pcf.configured ? 'petty cash fund' : 'fund not set up',
          { view: c.pcf.view }, c.pcf.balanceNegative ? 'text-amber-600' : undefined)}
      </div>

      {/* ---- 3. charts: cash in vs out, aging (receivables | payables), spending by GL account ---- */}
      <OverviewCharts charts={data.charts} />

      {/* ---- 4. calendar (about two thirds) + next 14 days (one third): same height, tops aligned; stacked on a phone ---- */}
      <div className="[display:grid] lg:grid-cols-3 gap-4 items-stretch" data-calendar-row>
        <div className="lg:col-span-2 min-w-0">
          <OverviewCalendar month={calMonth ?? data.calendar.month} events={(calMonth && cal ? cal : data.calendar).events} today={data.today}
            selected={selDay} onSelect={setSelDay} onMonth={goMonth} onOpen={onOpen} loading={calLoading} />
        </div>
        <div className="relative min-w-0" data-next14-host>
          <Next14 data={data.next14} onOpen={onOpen} />
        </div>
      </div>

      {/* ---- 5. no due date set ---- */}
      <div className="bg-white rounded-xl border border-gray-200" data-nodue>
        <button type="button" onClick={() => setNoDueOpen(!noDueOpen)} aria-expanded={noDueOpen}
          className="w-full flex items-center gap-2 px-4 py-3 text-left">
          {noDueOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <CalendarClock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-800">No due date set</span>
          <span className="text-xs text-gray-400">· {data.noDueDate.length} item{data.noDueDate.length === 1 ? '' : 's'} nobody is watching</span>
        </button>
        {noDueOpen && (
          data.noDueDate.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-400">Everything open has a date.</p> : (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {TYPE_ORDER.filter(t => data.noDueDate.some(x => x.type === t)).map(t => (
                <div key={t}>
                  <p className="px-4 pt-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{TYPE_LABEL[t]} · {data.noDueDate.filter(x => x.type === t).length}</p>
                  {data.noDueDate.filter(x => x.type === t).map(x => (
                    <button key={x.id} type="button" data-nodue-item={x.id} onClick={() => onOpen(x.link)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left hover:bg-gray-50">
                      <span className="min-w-0"><span className="block text-sm text-gray-800 truncate">{x.title}</span><span className="block text-xs text-gray-400 truncate">{x.subtitle}</span></span>
                      {x.amount && <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{peso(x.amount)}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {breakdown && <TotalSalesBreakdown period={period} data={c.totalSales.periods[period]} dateRule={c.totalSales.dateRule} onClose={() => setBreakdown(false)}
        onOpen={l => { setBreakdown(false); onOpen(l); }} />}

      {popup && <DailyPopup data={data} onOpen={open} onGotIt={gotIt} onDismiss={() => setPopup(false)} />}
    </div>
  );
}

// The Total Sales breakdown: every contract in the chosen period with its VAT-inclusive value, what has been billed
// against it and what is not yet billed. Everything shown arrives from the server; nothing is added up here.
export function TotalSalesBreakdown({ period, data, dateRule, onClose, onOpen }: {
  period: SalesPeriod; data: SalesPeriodData; dateRule: string; onClose: () => void; onOpen: (l: OverviewLink) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-breakdown onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Total Sales · {PERIOD_LABEL[period]}</h3>
            <p className="text-xs text-gray-500">Contract price of each project and selling price of each trading deal, VAT included. By {dateRule}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:bg-gray-100 rounded-md"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm" data-breakdown-table>
            <thead className="bg-gray-50"><tr>
              <th className={`${TH} text-left`}>Contract</th><th className={`${TH} text-left`}>Date</th>
              <th className={`${TH} text-right`}>Contract value</th><th className={`${TH} text-right`}>Billed</th><th className={`${TH} text-right`}>Not yet billed</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No priced contracts in this period.</td></tr>}
              {data.rows.map(r => (
                <tr key={r.kind + r.id} data-bd-row={r.kind + ':' + r.id} onClick={() => onOpen(r.link)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 max-w-[260px]"><div className="truncate text-gray-900" title={r.name}>{r.name}</div>
                    <div className="text-[11px] text-gray-400">{r.kind === 'project' ? 'Project' : 'Trading deal'}{r.status ? ` · ${r.status}` : ''}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">{shortDate(r.contractDate)}<div className="text-[11px] text-gray-400">{r.dateBasis}</div></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-gray-900 tabular-nums">{peso(r.value)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700 tabular-nums">{peso(r.billed)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700 tabular-nums">{peso(r.notBilled)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-gray-50 font-semibold border-t border-gray-200" data-bd-total>
              <td className="px-3 py-2 text-gray-900" colSpan={2}>Total · {data.count} contract{data.count === 1 ? '' : 's'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{peso(data.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{peso(data.billed)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{peso(data.notBilled)}</td>
            </tr></tfoot>
          </table>
          {data.unpriced.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-3" data-bd-unpriced>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-1">Not priced yet · left out of the total</p>
              {data.unpriced.map(u => (
                <button key={u.kind + u.id} type="button" onClick={() => onOpen(u.link)} className="w-full flex items-center justify-between gap-3 py-1.5 text-left text-sm hover:bg-gray-50">
                  <span className="min-w-0 truncate text-gray-800">{u.name} <span className="text-[11px] text-gray-400">· {u.kind === 'project' ? 'Project' : 'Trading deal'}</span></span>
                  {Number(u.billed) > 0 && <span className="text-xs text-gray-500 whitespace-nowrap">billed {peso(u.billed)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A list of alerts, one line each. Used by the strip's list, the pop-up and (Part 2) the calendar day.
export function AlertRows({ alerts, onOpen, showType }: { alerts: OverviewAlert[]; onOpen: (l: OverviewLink) => void; showType?: boolean }) {
  return (
    <div className="divide-y divide-gray-100">
      {alerts.map(a => (
        <button key={a.id} type="button" data-alert={a.id} data-severity={a.severity} onClick={() => onOpen(a.link)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${SEV_STYLE[a.severity]}`}>{whenText(a)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-gray-900 truncate">{showType ? `${TYPE_LABEL[a.type]} · ` : ''}{a.title}</span>
            <span className="block text-xs text-gray-400 truncate">{shortDate(a.date)}{a.subtitle ? ` · ${a.subtitle}` : ''}</span>
          </span>
          {a.amount && <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{peso(a.amount)}</span>}
        </button>
      ))}
    </div>
  );
}

// The once-a-day pop-up: overdue, due today and due within 7 days, grouped by type, each item clickable.
export function DailyPopup({ data, onOpen, onGotIt, onDismiss }: {
  data: OverviewData; onOpen: (l: OverviewLink) => void; onGotIt: () => void; onDismiss: () => void;
}) {
  const t = data.totals;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-daily-popup onMouseDown={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-gray-900">Needs your attention</h3>
            <p className="text-xs text-gray-500">
              {t.overdue > 0 && <span className="text-red-600 font-semibold">{t.overdue} overdue</span>}
              {t.overdue > 0 && (t.today > 0 || t.upcoming > 0) && ' · '}
              {t.today > 0 && <span className="text-amber-600 font-semibold">{t.today} due today</span>}
              {t.today > 0 && t.upcoming > 0 && ' · '}
              {t.upcoming > 0 && <span>{t.upcoming} due within {data.horizonDays} days</span>}
            </p>
          </div>
        </div>
        <div className="overflow-y-auto">
          {TYPE_ORDER.filter(ty => data.alerts.some(a => a.type === ty)).map(ty => (
            <div key={ty} data-popup-group={ty}>
              <p className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{TYPE_LABEL[ty]} · {data.counts[ty].total}</p>
              <AlertRows alerts={data.alerts.filter(a => a.type === ty)} onOpen={onOpen} />
            </div>
          ))}
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-gray-200">
          <button type="button" data-got-it onClick={onGotIt} className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800">Got it</button>
        </div>
      </div>
    </div>
  );
}
