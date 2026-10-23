// ============================================================================
// Accounting Overview — charts. Recharts (already a dependency). Every figure is built by the server from the same
// rows the reports read; the browser only draws them.
//
//   Cash in vs cash out   last 6 months, grouped bars (collections vs disbursements) with the net per month
//   Aging                 receivables and payables side by side, by days late
//   Spending by GL account  this month's expense lines
//
// Readable at phone width: charts fill their card, month labels are short, money is abbreviated on the axes and exact
// in the tooltip, and the two aging charts stack below the md breakpoint.
// ============================================================================

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTHS, num, peso, pesoShort } from '../lib/overviewFormat';

export interface CashFlowMonth { month: string; collected: string; disbursed: string; net: string; collectedCount: number; disbursedCount: number }
export interface AgingBucket { key: string; label: string; amount: string; count: number }
export interface AgingSide { buckets: AgingBucket[]; total: string; count: number }
export interface GlRow { key: string; name: string; amount: string; lines: number }
export interface ChartsData {
  cashFlow: CashFlowMonth[];
  aging: { receivables: AgingSide; payables: AgingSide };
  spendByGl: { month: string; rows: GlRow[]; total: string };
}

// The app's colours: collections green and disbursements red (as on the calendar), aging from neutral through amber to red.
export const COLORS = { collected: '#10b981', disbursed: '#ef4444', gl: '#3b82f6', noGl: '#9ca3af', grid: '#e5e7eb', axis: '#6b7280' };
export const AGING_COLORS = ['#9ca3af', '#f59e0b', '#f97316', '#ef4444', '#991b1b'];
export const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5)) - 1];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (ym: string) => `${FULL_MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

// recharts measures its parent; initialDimension gives it a size on the first paint (and before layout exists).
const INIT = { width: 480, height: 260 };

function Card({ title, sub, children, testId }: { title: string; sub?: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 min-w-0" data-chart={testId}>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {sub && <p className="text-xs text-gray-400 mb-2">{sub}</p>}
      {children}
    </div>
  );
}

function MoneyTip({ active, payload, label, extra }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.dataKey} style={{ color: p.color || p.fill }}>{p.name}: <span className="font-semibold">{peso(p.value)}</span></p>)}
      {extra && <p className="text-gray-500 mt-1">{extra(payload[0].payload)}</p>}
    </div>
  );
}

export function CashFlowChart({ data }: { data: CashFlowMonth[] }) {
  const rows = data.map(m => ({ ...m, label: monthLabel(m.month), Collected: num(m.collected), Disbursed: num(m.disbursed) }));
  return (
    <Card title="Cash in vs cash out" sub="Last 6 months · collections vs disbursements (petty cash included)" testId="cashflow">
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={INIT}>
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={false} tickLine={false} width={48} tickFormatter={pesoShort} />
            <Tooltip content={<MoneyTip extra={(r: any) => `Net ${num(r.net) < 0 ? '−' : '+'}${peso(Math.abs(num(r.net)))}`} />} cursor={{ fill: '#f3f4f6' }} />
            <Bar dataKey="Collected" name="Collected" fill={COLORS.collected} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Disbursed" name="Disbursed" fill={COLORS.disbursed} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1">
        <span className="flex items-center gap-1"><span style={{ width: 9, height: 9, background: COLORS.collected, display: 'inline-block', borderRadius: 2 }} />Collected</span>
        <span className="flex items-center gap-1"><span style={{ width: 9, height: 9, background: COLORS.disbursed, display: 'inline-block', borderRadius: 2 }} />Disbursed</span>
      </div>
      {/* the net per month: collected − disbursed */}
      <div className="grid grid-cols-6 gap-1 mt-3 text-center" data-net-row>
        {data.map(m => {
          const n = num(m.net);
          return (
            <div key={m.month} data-net={m.month} className="rounded-md bg-gray-50 px-1 py-1.5">
              <p className="text-[10px] text-gray-400">{monthLabel(m.month)}</p>
              <p className={`text-[11px] font-bold leading-tight ${n < 0 ? 'text-red-600' : n > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{n > 0 ? '+' : n < 0 ? '−' : ''}{pesoShort(Math.abs(n))}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">Net = collected − disbursed</p>
    </Card>
  );
}

function AgingChart({ title, side, testId }: { title: string; side: AgingSide; testId: string }) {
  const rows = side.buckets.map((b, i) => ({ ...b, value: num(b.amount), short: ['Not due', '1–30', '31–60', '61–90', '90+'][i] }));
  return (
    <Card title={title} sub={`${peso(side.total)} outstanding · ${side.count} open`} testId={testId}>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="short" tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={false} tickLine={false} width={48} tickFormatter={pesoShort} />
            <Tooltip content={<MoneyTip extra={(r: any) => `${r.label} · ${r.count} item${r.count === 1 ? '' : 's'}`} />} cursor={{ fill: '#f3f4f6' }} />
            <Bar dataKey="value" name="Balance" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((r, i) => <Cell key={r.key} fill={AGING_COLORS[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-gray-400">Days late counted from the next unmet due date; no due date counts as not yet due.</p>
    </Card>
  );
}

export function AgingCharts({ aging }: { aging: ChartsData['aging'] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-aging>
      <AgingChart title="Receivables aging" side={aging.receivables} testId="aging-receivables" />
      <AgingChart title="Payables aging" side={aging.payables} testId="aging-payables" />
    </div>
  );
}

export function GlSpendChart({ data }: { data: ChartsData['spendByGl'] }) {
  const rows = data.rows.map(r => ({ ...r, value: num(r.amount) }));
  const h = Math.max(120, rows.length * 34 + 30);
  return (
    <Card title="Spending by GL account" sub={`${monthName(data.month)} · expense lines of active vouchers · ${peso(data.total)} (PO payments are not expenses)`} testId="gl-spend">
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">No expense lines this month.</p> : (
        <div style={{ width: '100%', height: h }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: h }}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={false} tickLine={false} tickFormatter={pesoShort} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: COLORS.axis }} axisLine={false} tickLine={false} />
              <Tooltip content={<MoneyTip extra={(r: any) => `${r.lines} expense line${r.lines === 1 ? '' : 's'}`} />} cursor={{ fill: '#f3f4f6' }} />
              <Bar dataKey="value" name="Spent" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {rows.map(r => <Cell key={r.key} fill={r.key === 'none' ? COLORS.noGl : COLORS.gl} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function OverviewCharts({ charts }: { charts: ChartsData }) {
  return (
    <div className="space-y-4" data-charts>
      <CashFlowChart data={charts.cashFlow} />
      <AgingCharts aging={charts.aging} />
      <GlSpendChart data={charts.spendByGl} />
    </div>
  );
}
