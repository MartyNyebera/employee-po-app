// ============================================================================
// Accounting Overview — month calendar + "Next 14 days" list.
// Both are server-built (events carry their own date and an `overdue` flag); the browser lays out a month grid and
// routes clicks. Overdue items keep their marker on the ORIGINAL date, outlined in red. No dependency: it is a grid.
//
// Layout rules (so every cell lines up and nothing ever pushes the grid taller):
//   • one 7-column grid holds the weekday headings AND every day cell, so a heading sits exactly over its column
//   • every day cell has the same fixed height; the date number is top-left, markers sit on the bottom line
//   • at most 3 markers are drawn in a cell, then "+n"; a day's items open in a popover, never by growing the grid
//   • days of the neighbouring months fill the first/last week, dimmed and inert
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
/** Most markers a day cell draws before it says "+n". */
export const MAX_MARKERS = 3;

export const shiftMonthYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

/** The weeks of a month as rows of 7 cells (null = outside the month). Kept for callers that want the bare month. */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

/** Whole weeks covering the month, each cell a real date; `inMonth` is false for the neighbouring months' days. */
export function monthCells(ym: string): { date: string; inMonth: boolean }[] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = first.getUTCDay();
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + n) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    return { date: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === m - 1 };
  });
}

/** The markers a day shows: one per kind, overdue kinds first, capped at MAX_MARKERS with the rest counted. */
export function dayMarkers(events: CalEvent[]): { shown: { kind: CalKind; overdue: boolean }[]; more: number } {
  const kinds = KIND_ORDER.filter(k => events.some(e => e.kind === k)).map(k => ({ kind: k, overdue: events.some(e => e.kind === k && e.overdue) }));
  kinds.sort((a, b) => Number(b.overdue) - Number(a.overdue));
  return { shown: kinds.slice(0, MAX_MARKERS), more: Math.max(0, kinds.length - MAX_MARKERS) };
}

function KindDot({ kind, overdue, size = 10 }: { kind: CalKind; overdue?: boolean; size?: number }) {
  return (
    <span data-marker={kind} data-overdue={overdue ? 'true' : 'false'} title={KIND_LABEL[kind] + (overdue ? ' (overdue)' : '')}
      style={{ width: size, height: size, borderRadius: 999, background: KIND_COLOR[kind], display: 'inline-block', flexShrink: 0,
        boxShadow: overdue ? '0 0 0 1.5px #fff, 0 0 0 3px #dc2626' : undefined }} />
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
  const cells = useMemo(() => monthCells(month), [month]);
  const dayEvents = selected ? (byDay.get(selected) || []) : [];

  // Where the popover sits: just under the clicked cell, or above it for the lower rows, clamped inside the grid.
  const gridRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const POP_W = 340;
  const place = (el: HTMLElement) => {
    const g = gridRef.current; if (!g) { setPos(null); return; }
    const gw = g.clientWidth, gh = g.clientHeight;
    const left = gw > 0 ? Math.max(0, Math.min(el.offsetLeft - 8, gw - Math.min(POP_W, gw))) : 0;
    if (gh > 0 && el.offsetTop > gh / 2) setPos({ left, bottom: gh - el.offsetTop + 4 });
    else setPos({ left, top: el.offsetTop + el.offsetHeight + 4 });
  };
  useEffect(() => { if (!selected) setPos(null); }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSelect(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 min-w-0" data-calendar={month}>
      {/* month title centred between the previous / next buttons; "Today" on the left, an empty twin on the right keeps the title centred */}
      <div className="[display:grid] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center mb-3">
        <div>
          <button type="button" data-cal-today onClick={() => { onMonth(today.slice(0, 7)); onSelect(null); }}
            className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Today</button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" data-cal-prev onClick={() => onMonth(shiftMonthYm(month, -1))} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
          <p className="min-w-[132px] sm:min-w-[160px] text-center text-sm font-semibold text-gray-900" data-cal-title>{MONTH_NAMES[mo - 1]} {y}</p>
          <button type="button" data-cal-next onClick={() => onMonth(shiftMonthYm(month, 1))} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div />
      </div>

      <div ref={gridRef} className={`relative ${loading ? 'opacity-60' : ''}`}>
        <div className="[display:grid] grid-cols-7 gap-1" data-cal-grid>
          {DOW.map(d => <div key={d} data-dow className="h-6 flex items-center justify-center text-[11px] font-semibold text-gray-400">{d}</div>)}
          {cells.map(({ date, inMonth }) => {
            const num = Number(date.slice(8));
            if (!inMonth) {
              // a neighbouring month's day: same size, dimmed, nothing to click
              return <div key={date} data-day-out={date} className="h-[56px] sm:h-[84px] rounded-lg bg-gray-50/60 px-1.5 pt-1 text-xs text-gray-300">{num}</div>;
            }
            const es = byDay.get(date) || [];
            const { shown, more } = dayMarkers(es);
            const isToday = date === today, isSel = date === selected;
            return (
              <button key={date} type="button" data-day={date} data-today={isToday ? 'true' : 'false'} aria-pressed={isSel}
                onClick={e => { if (isSel) { onSelect(null); } else { place(e.currentTarget); onSelect(date); } }}
                className={`relative h-[56px] sm:h-[84px] rounded-lg border text-left px-1.5 pt-1 overflow-hidden hover:bg-gray-50 ${
                  isSel ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200'} ${isToday ? 'ring-2 ring-blue-500 ring-offset-0 border-blue-500' : ''}`}>
                <span className={`block text-xs leading-4 ${isToday ? 'font-bold text-blue-700' : 'text-gray-700'}`}>{num}</span>
                <span className="absolute left-1.5 right-1 bottom-1 flex items-center gap-1 flex-nowrap overflow-hidden" data-markers>
                  {shown.map(m => <KindDot key={m.kind} kind={m.kind} overdue={m.overdue} size={8} />)}
                  {more > 0 && <span data-more className="text-[10px] leading-none font-semibold text-gray-500 whitespace-nowrap">+{more}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* the selected day's items: a popover over the grid, so the grid never changes height */}
        {selected && (
          <div data-day-panel={selected} role="dialog" aria-label={`Items on ${shortDate(selected)}`}
            className="absolute z-20 bg-white border border-gray-200 rounded-xl shadow-lg"
            style={{ width: `min(${POP_W}px, 100%)`, left: pos?.left ?? 0, ...(pos?.bottom !== undefined ? { bottom: pos.bottom } : { top: pos?.top ?? '50%' }) }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{shortDate(selected)} · {dayEvents.length} item{dayEvents.length === 1 ? '' : 's'}</p>
              <button type="button" onClick={() => onSelect(null)} aria-label="Close" className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {dayEvents.length === 0 ? <p className="px-3 py-3 text-sm text-gray-400">Nothing on this day.</p> : <EventRows compact events={dayEvents} onOpen={l => { onSelect(null); onOpen(l); }} />}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] leading-4 text-gray-500" data-legend>
        {KIND_ORDER.map(k => <span key={k} className="flex items-center gap-1"><KindDot kind={k} size={8} />{KIND_LABEL[k]}</span>)}
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: '#fff', boxShadow: '0 0 0 1.5px #dc2626', display: 'inline-block' }} />overdue</span>
      </div>
    </div>
  );
}

/** Event rows: a coloured dot, the title, the amount. An item with no link (a holiday) is plain text. */
export function EventRows({ events, onOpen, showDate, compact }: { events: CalEvent[]; onOpen: (l: CalLink) => void; showDate?: boolean; /** Narrow panels: no separate type column; the type goes on the second line. */ compact?: boolean }) {
  return (
    <div className="divide-y divide-gray-100">
      {events.map(e => {
        const inner = (
          <>
            {showDate && <span className="w-14 flex-shrink-0 text-xs font-medium text-gray-500 whitespace-nowrap">{shortDate(e.date).replace(/, [0-9]{4}$/, '')}</span>}
            <KindDot kind={e.kind} overdue={e.overdue} size={9} />
            {!compact && <span className="w-28 flex-shrink-0 hidden sm:block text-xs text-gray-400 truncate">{KIND_LABEL[e.kind]}</span>}
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 truncate">{e.title}</span>
              <span className="block text-xs text-gray-400 truncate"><span className={compact ? '' : 'sm:hidden'}>{KIND_LABEL[e.kind]}{e.subtitle ? ' · ' : ''}</span>{e.subtitle}{e.overdue ? ` · ${-e.days} day${-e.days === 1 ? '' : 's'} late` : ''}</span>
            </span>
            {e.amount && <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{peso(e.amount)}</span>}
          </>
        );
        return e.link ? (
          <button key={e.id} type="button" data-event={e.id} data-kind={e.kind} onClick={() => onOpen(e.link!)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50">{inner}</button>
        ) : (
          <div key={e.id} data-event={e.id} data-kind={e.kind} className="w-full flex items-center gap-3 px-3 py-2.5">{inner}</div>
        );
      })}
    </div>
  );
}

/**
 * Next 14 days. Beside the calendar (lg and up) it fills exactly the calendar's height and scrolls inside itself; on a
 * phone it stacks under the calendar with a capped height. The parent supplies a `relative` wrapper for the lg case.
 */
export function Next14({ data, onOpen }: { data: Next14Data; onOpen: (l: CalLink) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col min-w-0 max-h-[440px] lg:max-h-none lg:absolute lg:inset-0" data-next14>
      <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900 flex-shrink-0">Next 14 days <span className="font-normal text-gray-400">· {shortDate(data.from)} – {shortDate(data.to)}</span></p>
      <div className="flex-1 min-h-0 overflow-y-auto" data-next14-scroll>
        {data.overdue.length > 0 && (
          <div data-next14-overdue>
            <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-red-600">Overdue · {data.overdue.length}</p>
            <EventRows compact events={data.overdue} onOpen={onOpen} showDate />
          </div>
        )}
        <div data-next14-upcoming>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Coming up · {data.upcoming.length}</p>
          {data.upcoming.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-400">Nothing due in the next 14 days.</p> : <EventRows compact events={data.upcoming} onOpen={onOpen} showDate />}
        </div>
      </div>
    </div>
  );
}
