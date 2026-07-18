import { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';

// #7 — per-project budget vs spend. Each project carries an allotted budget (budget_allocation);
// every purchase request linked to it deducts its cost from that budget. Per the chosen rule,
// only COMMITTED spend counts — PRs that reached 'approved' or 'ordered' — using the priced final
// total where available, else the employee estimate.
//
// Presentation: one CARD per project (scroll horizontally through them), each with two bars —
// Remaining budget and Spent. The Spent bar turns RED once it exceeds the Remaining (i.e. more
// than half the budget is consumed), and an over-budget note appears when spend passes the budget.
interface Project { id: string; name: string; budgetAllocation?: number }
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
          fetchApi<Project[]>('/projects'),
          fetchApi<PR[]>('/purchase-requests'),
        ]);
        const spentByProject = new Map<string, number>();
        for (const pr of prs || []) {
          if (!pr.projectId || !COUNTED.has(String(pr.status))) continue;
          const cost = (pr.finalTotal != null ? pr.finalTotal : pr.total) || 0;
          spentByProject.set(pr.projectId, (spentByProject.get(pr.projectId) || 0) + Number(cost));
        }
        const data = (projects || []).map(p => {
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
    <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '10px' }}>
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
          <div key={i} style={{ minWidth: '210px', flexShrink: 0, background: '#ffffff', border: '1px solid #d6d6d6', borderRadius: '12px', padding: '16px 18px' }}>
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
