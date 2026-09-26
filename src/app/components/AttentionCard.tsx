import { useState } from 'react';
import { Bell, X } from 'lucide-react';

// ============================================================================
// The attention card (#8). A dismissible card, top-right in the page body, that appears when the
// signed-in user has items awaiting them — one row per queue with its count and a "View" that
// jumps there. Dismissing hides it (local state); it re-appears when the total RISES above the
// level at which it was dismissed, so a newly-arrived item nags again without pestering on every
// poll. The red accent matches the one shared count bubble (NavBadge).
// ============================================================================

// `detail` is an optional second line for items where the count alone says nothing useful (e.g. WHICH
// employees passed their grace allowance). `onView` is optional: an item with nowhere to jump to
// renders as plain text instead of a button, rather than offering a click that does nothing.
export interface AttentionItem { label: string; count: number; onView?: () => void; detail?: string }

export function AttentionCard({ items }: { items: AttentionItem[] }) {
  const active = items.filter(i => i.count > 0);
  const total = active.reduce((n, i) => n + i.count, 0);
  // Hidden until the total climbs past what it was when last dismissed (0 = never dismissed).
  const [dismissedAt, setDismissedAt] = useState(0);

  if (!total || total <= dismissedAt) return null;

  return (
    <div className="fixed top-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="relative flex items-center justify-center w-6 h-6 rounded-full bg-red-50">
            <Bell className="w-3.5 h-3.5 text-red-600" />
          </span>
          <span className="text-sm font-semibold text-gray-900">Needs your attention</span>
        </div>
        <button onClick={() => setDismissedAt(total)} title="Dismiss" className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <ul className="divide-y divide-gray-100">
        {active.map((it, i) => {
          const body = (
            <>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-700">{it.label}</span>
                {it.detail ? <span className="block text-xs text-gray-500 mt-0.5 break-words">{it.detail}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-[18px] text-center">{it.count > 99 ? '99+' : it.count}</span>
              </span>
            </>
          );
          return (
            <li key={i}>
              {it.onView
                ? <button onClick={it.onView} className="w-full flex items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50">{body}</button>
                : <div className="w-full flex items-start justify-between gap-3 px-4 py-2.5 text-left">{body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
