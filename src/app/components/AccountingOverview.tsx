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

type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;

export interface OverviewLink { view: string; id?: string | number; search?: string }
export type AlertType = 'receivable' | 'payable' | 'project' | 'trading' | 'payday';
export type Severity = 'overdue' | 'today' | 'upcoming';

export interface OverviewAlert {
  id: string; type: AlertType; severity: Severity; title: string; subtitle: string; date: string;
  amount: string | null; days: number; daysLeft: number; daysLate: number; link: OverviewLink;
}
export interface NoDueItem { type: AlertType; id: string; title: string; subtitle: string; amount: string | null; link: OverviewLink }
interface Counts { overdue: number; today: number; upcoming: number; total: number }

export interface OverviewData {
  today: string; month: string;
  cards: {
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
  calendar: CalendarData; next14: Next14Data;
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

  const card = (key: string, title: string, big: string, sub: React.ReactNode, link: OverviewLink, tone?: string) => (
    <button key={key} type="button" data-card={key} onClick={() => onOpen(link)}
      className="text-left bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-300 hover:shadow-sm transition">
      <p className="text-xs font-medium text-gray-400">{title}</p>
      <p className={`mt-1 text-xl font-bold ${tone || 'text-gray-900'}`}>{big}</p>
      <p className="mt-0.5 text-[11px] text-gray-400 min-h-[16px]">{sub}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Overview</h2>
          <p className="text-sm text-gray-500">What needs attention today, {shortDate(data.today)}.</p>
        </div>
      </div>

      {/* ---- alert strip ---- */}
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

      {/* ---- five cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3" data-cards>
        {card('receivables', 'Receivables outstanding', peso(c.receivables.outstanding),
          c.receivables.overdueCount > 0 ? <span className="text-red-600">{peso(c.receivables.overdue)} overdue · {c.receivables.overdueCount}</span> : `${c.receivables.openCount} open · none overdue`,
          { view: c.receivables.view })}
        {card('payables', 'Payables outstanding', peso(c.payables.outstanding),
          c.payables.overdueCount > 0 ? <span className="text-red-600">{peso(c.payables.overdue)} overdue · {c.payables.overdueCount}</span> : `${c.payables.openCount} open · none overdue`,
          { view: c.payables.view })}
        {card('collected', 'Collected this month', peso(c.collected.amount), `${c.collected.count} payment${c.collected.count === 1 ? '' : 's'}`, { view: c.collected.view })}
        {card('disbursed', 'Disbursed this month', peso(c.disbursed.amount), `${c.disbursed.count} voucher${c.disbursed.count === 1 ? '' : 's'} · petty cash included`, { view: c.disbursed.view })}
        {card('pcf', 'PCF current balance', c.pcf.configured ? peso(c.pcf.balance) : '—', c.pcf.configured ? 'petty cash fund' : 'fund not set up',
          { view: c.pcf.view }, c.pcf.balanceNegative ? 'text-amber-600' : undefined)}
      </div>

      {/* ---- calendar + next 14 days: side by side on a wide screen, stacked under it on a phone ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 items-start" data-calendar-row>
        <OverviewCalendar month={calMonth ?? data.calendar.month} events={(calMonth && cal ? cal : data.calendar).events} today={data.today}
          selected={selDay} onSelect={setSelDay} onMonth={goMonth} onOpen={onOpen} loading={calLoading} />
        <Next14 data={data.next14} onOpen={onOpen} />
      </div>

      {/* ---- no due date set ---- */}
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

      {popup && <DailyPopup data={data} onOpen={open} onGotIt={gotIt} onDismiss={() => setPopup(false)} />}
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
