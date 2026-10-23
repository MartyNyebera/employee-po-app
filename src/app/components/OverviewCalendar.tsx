// ============================================================================
// Accounting Overview — month calendar + "Next 14 days" list.
// Both are server-built (events carry their own date and an `overdue` flag); the browser lays out a month grid and
// routes clicks. Overdue items keep their marker on the ORIGINAL date, outlined in red. No dependency: it is a grid.
// ============================================================================

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { peso, shortDate } from '../lib/overviewFormat';

export interface CalLink { view: string; id?: string | number; search?: string }
export type CalKind = 'receivable' | 'payable' | 'project' | 'trading' | 'payday' | 'holiday';
export interface CalEvent {
  id: string; kind: CalKind; date: string; title: string; subtitle: string; amount: string | null;
  overdue: boolean; days: number; link: CalLink | null;
}
export interface CalendarData { month: string; events: CalEvent[] }
export interface Next14Data { from: string; to: string; overdue: CalEvent[]; upcoming: CalEvent[] }

export const KIND_COLOR: Record<CalKind, string> = {
  receivable: '#10b981', payable: '#ef4444', project: '#3b82f6', trading: '#a855f7', payday: '#d4a017', holiday: '#9ca3af',
};
export const KIND_LABEL: Record<CalKind, string> = {
  receivable: 'Receivable due', payable: 'Payable due', project: 'Project target', trading: 'Deal delivery', payday: 'Payday', holiday: 'Holiday',
};
const KIND_ORDER: CalKind[] = ['receivable', 'payable', 'project', 'trading', 'payday', 'holiday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const shiftMonthYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

/** The weeks of a month as rows of 7 cells (null = outside the month). Display layout only. */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

function KindDot({ kind, overdue, size = 10 }: { kind: CalKind; overdue?: boolean; size?: number }) {
  return (
    <span data-marker={kind} data-overdue={overdue ? 'true' : 'false'} title={KIND_LABEL[kind]}
      style={{ width: size, height: size, borderRadius: 999, background: KIND_COLOR[kind], display: 'inline-block', flexShrink: 0,
        boxShadow: overdue ? '0 0 0 2px #fff, 0 0 0 3.5px #dc2626' : undefined }} />
  );
}

export function OverviewCalendar({ month, events, today, selected, onSelect, onMonth, onOpen, loading }: {
  month: string; events: CalEvent[]; today: string; selected: string | null;
  onSelect: (d: string | null) => void; onMonth: (ym: string) => void; onOpen: (l: CalLink) => void; loading?: boolean;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date)!.push(e); }
    return m;
  }, [events]);
  const [y, mo] = month.split('-').map(Number);
  const dayEvents = selected ? (byDay.get(selected) || []) : [];
  return (
    <div className="bg-white rounded-xl border border-gray-200" data-calendar={month}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button type="button" data-cal-prev onClick={() => onMonth(shiftMonthYm(month, -1))} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900" data-cal-title>{MONTH_NAMES[mo - 1]} {y}</p>
          {month !== today.slice(0, 7) && <button type="button" data-cal-today onClick={() => onMonth(today.slice(0, 7))} className="text-[11px] text-blue-600 hover:underline">Back to this month</button>}
        </div>
        <button type="button" data-cal-next onClick={() => onMonth(shiftMonthYm(month, 1))} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className={`px-2 sm:px-3 pb-2 ${loading ? 'opacity-60' : ''}`}>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-gray-400 py-2">{DOW.map(d => <div key={d}>{d}</div>)}</div>
        {monthGrid(month).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((d, di) => {
              if (!d) return <div key={di} className="h-12 sm:h-14" />;
              const es = byDay.get(d) || [];
              const kinds = KIND_ORDER.filter(k => es.some(e => e.kind === k));
              const isToday = d === today, isSel = d === selected;
              return (
                <button key={d} type="button" data-day={d} data-today={isToday ? 'true' : 'false'} onClick={() => onSelect(isSel ? null : d)}
                  className={`h-12 sm:h-14 m-px rounded-lg flex flex-col items-center justify-start pt-1 gap-1 text-xs hover:bg-gray-50 ${isSel ? 'bg-gray-100' : ''} ${isToday ? 'ring-2 ring-blue-500' : ''}`}>
                  <span className={`w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white font-bold' : 'text-gray-700'}`}>{Number(d.slice(8))}</span>
                  <span className="flex items-center justify-center gap-1 flex-wrap px-0.5 min-h-[10px]">
                    {kinds.map(k => <KindDot key={k} kind={k} overdue={es.some(e => e.kind === k && e.overdue)} size={8} />)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[11px] text-gray-500" data-legend>
        {KIND_ORDER.map(k => <span key={k} className="flex items-center gap-1"><KindDot kind={k} size={8} />{KIND_LABEL[k]}</span>)}
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: '#fff', boxShadow: '0 0 0 1.5px #dc2626', display: 'inline-block' }} />overdue</span>
      </div>
      {selected && (
        <div className="border-t border-gray-100" data-day-panel={selected}>
          <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gray-400">{shortDate(selected)} · {dayEvents.length} item{dayEvents.length === 1 ? '' : 's'}</p>
          {dayEvents.length === 0 ? <p className="px-4 pb-3 text-sm text-gray-400">Nothing on this day.</p> : <EventRows events={dayEvents} onOpen={onOpen} />}
        </div>
      )}
    </div>
  );
}

/** Event rows: a coloured dot, the title, the amount. An item with no link (a holiday) is plain text. */
export function EventRows({ events, onOpen, showDate }: { events: CalEvent[]; onOpen: (l: CalLink) => void; showDate?: boolean }) {
  return (
    <div className="divide-y divide-gray-100">
      {events.map(e => {
        const inner = (
          <>
            {showDate && <span className="w-14 flex-shrink-0 text-xs font-medium text-gray-500 whitespace-nowrap">{shortDate(e.date).replace(/, [0-9]{4}$/, '')}</span>}
            <KindDot kind={e.kind} overdue={e.overdue} size={9} />
            <span className="w-28 flex-shrink-0 hidden sm:block text-xs text-gray-400 truncate">{KIND_LABEL[e.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 truncate">{e.title}</span>
              <span className="block text-xs text-gray-400 truncate"><span className="sm:hidden">{KIND_LABEL[e.kind]}{e.subtitle ? ' · ' : ''}</span>{e.subtitle}{e.overdue ? ` · ${-e.days} day${-e.days === 1 ? '' : 's'} late` : ''}</span>
            </span>
            {e.amount && <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{peso(e.amount)}</span>}
          </>
        );
        return e.link ? (
          <button key={e.id} type="button" data-event={e.id} data-kind={e.kind} onClick={() => onOpen(e.link!)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">{inner}</button>
        ) : (
          <div key={e.id} data-event={e.id} data-kind={e.kind} className="w-full flex items-center gap-3 px-4 py-2.5">{inner}</div>
        );
      })}
    </div>
  );
}

export function Next14({ data, onOpen }: { data: Next14Data; onOpen: (l: CalLink) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200" data-next14>
      <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Next 14 days <span className="font-normal text-gray-400">· {shortDate(data.from)} – {shortDate(data.to)}</span></p>
      {data.overdue.length > 0 && (
        <div data-next14-overdue>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-red-600">Overdue · {data.overdue.length}</p>
          <EventRows events={data.overdue} onOpen={onOpen} showDate />
        </div>
      )}
      <div data-next14-upcoming>
        <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Coming up · {data.upcoming.length}</p>
        {data.upcoming.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-400">Nothing due in the next 14 days.</p> : <EventRows events={data.upcoming} onOpen={onOpen} showDate />}
      </div>
    </div>
  );
}
