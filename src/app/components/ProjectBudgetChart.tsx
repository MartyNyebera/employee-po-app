import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';

// #7 — per-project budget vs spend. Each project carries an allotted budget (budget_allocation);
// spend is committed purchase requests PLUS direct project expenses (gas, Lalamove, meals…).
//
// Spend is NOT summed here any more. It comes from GET /api/projects/spend, the single server-side
// definition (PROJECT_SPEND_SQL in server/index.js) that Accounting's Project Allocation table reads
// too — so the two screens can never disagree, and this dashboard no longer downloads every
// purchase request just to add up a handful of them.
//
// Only ACTIVE projects appear here. A finished project's "remaining budget" says nothing useful on
// the main dashboard, so a completed (soft-archived) one drops out, the same way it drops out of the
// purchase-request picker. This is scoped to THIS dashboard chart: Accounting's Project Allocation
// and the admin Project History still list completed projects in full, deliberately.
//
// Presentation: one CARD per project, each with two bars — Remaining budget and Spent. The Spent bar
// is STACKED: purchased (PRs) at the bottom, direct expenses on top, so you can see how much of the
// spend never went through purchasing. It turns RED once spent exceeds the remaining (i.e. more
// than half the budget is consumed), and an over-budget note appears when spend passes the budget.
interface SpendRow {
  projectId: string; name: string; status?: string;
  budget: number; spentPrs: number; spentExpenses: number; spent: number; remaining: number; overBudget: number;
}

const fmt = (v: number) =>
  v >= 1e6 ? '₱' + (v / 1e6).toFixed(1) + 'M'
    : v >= 1e3 ? '₱' + (v / 1e3).toFixed(0) + 'K'
      : '₱' + Math.round(v);
const peso = (v: number) => '₱' + (Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });

// Purchased vs direct-expense shades. Paired by lightness (light + dark of one hue) so the split
// still reads without relying on telling two hues apart.
const SHADES = {
  normal: { prs: '#d1b01b', expenses: '#7a6410' },
  hot: { prs: '#dc2626', expenses: '#7f1d1d' },
};

export function ProjectBudgetChart() {
  const [rows, setRows] = useState<SpendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const spend = await fetchApi<SpendRow[]>('/projects/spend');
        setRows((spend || []).filter(r => r.status !== 'Completed' && (r.budget > 0 || r.spent > 0)));
      } catch { /* leave empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <div className="w-full flex items-center justify-center" style={{ height: 220 }}><div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-[#d1b01b] animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <div className="w-full border border-slate-200 rounded-lg flex items-center justify-center" style={{ height: 160 }}><p className="text-slate-500 text-sm">No project budgets yet — set a budget on a project, then link approved requests or log expenses to it.</p></div>;
  }

  const TRACK = 170; // px height of the bar track
  const BAR_W = 48;

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
      {rows.map((r) => {
        const scale = Math.max(r.budget, r.spent, 1);
        const shade = r.spent > r.remaining ? SHADES.hot : SHADES.normal;
        const pct = (v: number) => (v / scale) * 100;
        // Spent is drawn as its two parts; the total's label sits on top of the stack. The 2%
        // floor keeps a zero bar visible as a sliver, applied to the stack as a whole.
        const spentPct = Math.max(2, pct(r.spent));
        const expShare = r.spent > 0 ? r.spentExpenses / r.spent : 0;
        return (
          // minWidth 0 so a grid track can shrink and the long-name ellipsis still works.
          <div key={r.projectId} style={{ minWidth: 0, background: '#ffffff', border: '1px solid #d6d6d6', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontWeight: 700, color: '#000000', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</div>
            <div style={{ fontSize: '11px', color: '#8a8a8a', marginBottom: '14px' }} title={peso(r.budget)}>Budget {fmt(r.budget)}</div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '28px', height: `${TRACK}px`, borderBottom: '1px solid #e6e6e6' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#5a5a5a', marginBottom: '4px', whiteSpace: 'nowrap' }} title={peso(r.remaining)}>{fmt(r.remaining)}</div>
                <div title={`Remaining: ${peso(r.remaining)}`}
                  style={{ width: `${BAR_W}px`, height: `${Math.max(2, pct(r.remaining))}%`, background: '#c9c9c9', borderRadius: '6px 6px 0 0', transition: 'height .5s ease' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#5a5a5a', marginBottom: '4px', whiteSpace: 'nowrap' }} title={peso(r.spent)}>{fmt(r.spent)}</div>
                <div title={`Spent: ${peso(r.spent)} — purchased ${peso(r.spentPrs)}, expenses ${peso(r.spentExpenses)}`}
                  style={{ width: `${BAR_W}px`, height: `${spentPct}%`, display: 'flex', flexDirection: 'column', borderRadius: '6px 6px 0 0', overflow: 'hidden', transition: 'height .5s ease' }}>
                  <div style={{ flex: `${expShare} 1 0`, background: shade.expenses }} />
                  <div style={{ flex: `${1 - expShare} 1 0`, background: shade.prs }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '28px', marginTop: '6px' }}>
              {['Remaining', 'Spent'].map((label) => (
                <div key={label} style={{ width: `${BAR_W}px`, textAlign: 'center', fontSize: '11px', color: '#5a5a5a' }}>{label}</div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', columnGap: '14px', rowGap: '2px', marginTop: '10px', fontSize: '11px', color: '#5a5a5a' }}>
              <span title={peso(r.spentPrs)} style={{ whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: shade.prs, marginRight: '5px' }} />
                Purchased {fmt(r.spentPrs)}
              </span>
              <span title={peso(r.spentExpenses)} style={{ whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: shade.expenses, marginRight: '5px' }} />
                Expenses {fmt(r.spentExpenses)}
              </span>
            </div>

            {r.overBudget > 0 && (
              <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 600, color: '#dc2626', textAlign: 'center' }} title={peso(r.overBudget)}>Over budget by {fmt(r.overBudget)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
