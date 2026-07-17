import { useState } from 'react';
import { Bell, X } from 'lucide-react';

// ============================================================================
// The attention card (#8). A dismissible card, top-right in the page body, that appears when the
// signed-in user has items awaiting them — one row per queue with its count and a "View" that
// jumps there. Dismissing hides it (local state); it re-appears when the total RISES above the
// level at which it was dismissed, so a newly-arrived item nags again without pestering on every
// poll. The red accent matches the one shared count bubble (NavBadge).
// ============================================================================

export interface AttentionItem { label: string; count: number; onView: () => void }

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
        {active.map((it, i) => (
          <li key={i}>
            <button onClick={it.onView} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
              <span className="text-sm text-gray-700">{it.label}</span>
              <span className="flex items-center gap-2">
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-[18px] text-center">{it.count > 99 ? '99+' : it.count}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
