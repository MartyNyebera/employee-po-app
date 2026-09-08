import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';

// #7 — per-project budget vs spend. Each project carries an allotted budget (budget_allocation);
// every purchase request linked to it deducts its cost from that budget. Per the chosen rule,
// only COMMITTED spend counts — PRs that reached 'approved' or 'ordered' — using the priced final
// total where available, else the employee estimate.
//
// Only ACTIVE projects appear here. A finished project's "remaining budget" says nothing useful on
// the main dashboard, so a completed (soft-archived) one drops out the same way it drops out of the
// purchase-request picker — server-side via ?active=1, repeated client-side so a stale cached bundle
// behaves the same. This is scoped to THIS dashboard chart: Accounting's Project Allocation and the
// admin Project History still list completed projects in full, deliberately.
//
// Presentation: one CARD per project (scroll horizontally through them), each with two bars —
// Remaining budget and Spent. The Spent bar turns RED once it exceeds the Remaining (i.e. more
// than half the budget is consumed), and an over-budget note appears when spend passes the budget.
interface Project { id: string; name: string; budgetAllocation?: number; status?: string }
interface PR { projectId?: string | null; total?: number; finalTotal?: number | null; status?: string }
interface Row { name: string; budget: number; spent: number; remaining: number; over: number }

const COUNTED = new Set(['approved', 'ordered']);

const fmt = (v: number) =>
  v >= 1e6 ? '₱' + (v / 1e6).toFixed(1) + 'M'
    : v >= 1e3 ? '₱' + (v / 1e3).toFixed(0) + 'K'
      : '₱' + Math.round(v);
const peso = (v: number) => '₱' + (Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });

export function ProjectBudgetChart() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [projects, prs] = await Promise.all([
          fetchApi<Project[]>('/projects?active=1'),
          fetchApi<PR[]>('/purchase-requests'),
        ]);
        const spentByProject = new Map<string, number>();
        for (const pr of prs || []) {
          if (!pr.projectId || !COUNTED.has(String(pr.status))) continue;
          const cost = (pr.finalTotal != null ? pr.finalTotal : pr.total) || 0;
          spentByProject.set(pr.projectId, (spentByProject.get(pr.projectId) || 0) + Number(cost));
        }
        const data = (projects || []).filter(p => p.status !== 'Completed').map(p => {
          const budget = Number(p.budgetAllocation) || 0;
          const spent = spentByProject.get(p.id) || 0;
          return { name: p.name, budget, spent, remaining: Math.max(0, budget - spent), over: Math.max(0, spent - budget) };
        }).filter(r => r.budget > 0 || r.spent > 0);
        setRows(data);
      } catch { /* leave empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <div className="w-full flex items-center justify-center" style={{ height: 220 }}><div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-[#d1b01b] animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <div className="w-full border border-slate-200 rounded-lg flex items-center justify-center" style={{ height: 160 }}><p className="text-slate-500 text-sm">No project budgets yet — set a budget on a project and link approved requests to it.</p></div>;
  }

  const TRACK = 170; // px height of the bar track

  return (
    // A wrapping GRID, not a horizontal scroll rail: 3 cards per row on desktop (lg, >=1024px), 2 on
    // medium (sm, >=640px), 1 on mobile, stacking downward so every project is reachable by scrolling
    // the page instead of sideways. Tailwind is used here (as in the loading/empty states above)
    // because the breakpoints need real media queries, which an inline style object cannot express.
    //
    // NO `grid-cols-1` base class on purpose. This chart renders inside the dashboard's
    // `.admin-portal` wrapper, and professional-design-complete.css has
    // `.admin-portal .grid-cols-1 { grid-template-columns: repeat(1,...) !important }` -- that
    // !important beats the unprefixed sm:/lg: utilities and would silently pin the grid to a single
    // column at every width. A grid with no explicit template is already one column, so omitting the
    // class gives the same mobile result and sidesteps the override. (gap-4 is safe: the same
    // stylesheet maps it to 16px, exactly the gap the old flex rail used.)
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r, i) => {
        const scale = Math.max(r.budget, r.spent, 1);
        // The Spent bar is red once it is the larger of the two (spent > remaining), i.e. more than
        // half the budget spent; grey→gold otherwise.
        const spentColor = r.spent > r.remaining ? '#dc2626' : '#d1b01b';
        const bars = [
          { label: 'Remaining', value: r.remaining, color: '#c9c9c9' },
          { label: 'Spent', value: r.spent, color: spentColor },
        ];
        return (
          // Card itself is unchanged. minWidth 0 replaces the old flex sizing so a grid track can
          // shrink and the long-name ellipsis still works; flexShrink is meaningless in a grid.
          <div key={i} style={{ minWidth: 0, background: '#ffffff', border: '1px solid #d6d6d6', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontWeight: 700, color: '#000000', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</div>
            <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '14px' }} title={peso(r.budget)}>Budget {fmt(r.budget)}</div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '28px', height: `${TRACK}px`, borderBottom: '1px solid #e6e6e6' }}>
              {bars.map((b) => (
                <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#5a5a5a', marginBottom: '4px', whiteSpace: 'nowrap' }} title={peso(b.value)}>{fmt(b.value)}</div>
                  <div title={`${b.label}: ${peso(b.value)}`}
                    style={{ width: '48px', height: `${Math.max(2, (b.value / scale) * 100)}%`, background: b.color, borderRadius: '6px 6px 0 0', transition: 'height .5s ease' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '28px', marginTop: '6px' }}>
              {bars.map((b) => (
                <div key={b.label} style={{ width: '48px', textAlign: 'center', fontSize: '11px', color: '#5a5a5a' }}>{b.label}</div>
              ))}
            </div>

            {r.over > 0 && (
              <div style={{ marginTop: '10px', fontSize: '11px', fontWeight: 600, color: '#dc2626', textAlign: 'center' }} title={peso(r.over)}>Over budget by {fmt(r.over)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
