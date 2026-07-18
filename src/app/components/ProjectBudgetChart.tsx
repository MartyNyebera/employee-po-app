import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchApi } from '../api/client';

// #7 — per-project budget vs spend. Each project carries an allotted budget (budget_allocation);
// every purchase request linked to it deducts its cost from that budget. Per the chosen rule,
// only COMMITTED spend counts — PRs that reached 'approved' or 'ordered' — using the priced
// final total where available, else the employee estimate. The bar stacks Spent (gold) +
// Remaining (grey) so each project reads as a share of its budget consumed.
interface Project { id: string; name: string; budgetAllocation?: number }
interface PR { projectId?: string | null; total?: number; finalTotal?: number | null; status?: string }
interface Row { name: string; budget: number; spent: number; remaining: number; over: number }

const COUNTED = new Set(['approved', 'ordered']);

export function ProjectBudgetChart({ height = 360 }: { height?: number }) {
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

  const yFmt = (v: number) => v >= 1e6 ? '₱' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '₱' + (v / 1e3).toFixed(0) + 'K' : '₱' + v;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const r: Row | undefined = payload[0]?.payload;
    if (!r) return null;
    const peso = (v: number) => '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2 });
    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg" style={{ fontSize: '13px' }}>
        <p className="font-semibold text-slate-900 mb-1">{label}</p>
        <p style={{ color: '#5a5a5a' }}>Budget: {peso(r.budget)}</p>
        <p style={{ color: '#7a6a0c' }}>Spent: {peso(r.spent)}</p>
        {r.over > 0
          ? <p style={{ color: '#dc2626' }}>Over budget: {peso(r.over)}</p>
          : <p style={{ color: '#5a5a5a' }}>Remaining: {peso(r.remaining)}</p>}
      </div>
    );
  };

  if (loading) {
    return <div className="w-full flex items-center justify-center" style={{ height }}><div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-[#d1b01b] animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <div className="w-full border border-slate-200 rounded-lg flex items-center justify-center" style={{ height: 200 }}><p className="text-slate-500 text-sm">No project budgets yet — set a budget on a project and link approved requests to it.</p></div>;
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 24, left: 12, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d6d6d6" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#5a5a5a', fontSize: 12 }} tickLine={{ stroke: '#d6d6d6' }} interval={0} angle={rows.length > 4 ? -20 : 0} textAnchor={rows.length > 4 ? 'end' : 'middle'} height={rows.length > 4 ? 60 : 30} />
          <YAxis tickFormatter={yFmt} tick={{ fill: '#5a5a5a', fontSize: 12 }} tickLine={{ stroke: '#d6d6d6' }} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '14px' }} />
          {/* Stacked: spent + remaining sum to the budget. An over-budget project shows a red cap. */}
          <Bar dataKey="spent" stackId="b" fill="#d1b01b" name="Spent" isAnimationActive animationDuration={900} />
          <Bar dataKey="remaining" stackId="b" fill="#e6e6e6" name="Remaining" isAnimationActive animationDuration={900} />
          <Bar dataKey="over" stackId="b" fill="#dc2626" name="Over budget" isAnimationActive animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
