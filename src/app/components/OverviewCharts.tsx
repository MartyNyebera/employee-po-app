// ============================================================================
// Accounting Overview — charts. Recharts (already a dependency). Every figure is built by the server from the same
// rows the reports read; the browser only draws them.
//
//   Cash in vs cash out   last 6 months, grouped bars (collections vs disbursements) with the net per month
//   Aging                 receivables and payables side by side, by days late
//   Spending by GL account  this month's expense lines
//
// Layout rules: every panel has the same padding, title and subtitle style and clips its own contents (a chart can
// never spill out of its panel); the two aging panels sit in one row and stretch to the same height; the axes show whole
// pesos with thousands separators (₱18,500); the panels stack on a phone.
// ============================================================================

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTHS, num, peso, pesoWhole } from '../lib/overviewFormat';

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
const TICK = { fontSize: 11, fill: COLORS.axis };
// Room for "₱100,000" without touching the bars.
const Y_WIDTH = 64;

/** One chart panel: identical padding, title and subtitle everywhere; clips its own contents; fills its grid cell. */
function Panel({ title, sub, children, testId }: { title: string; sub?: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 min-w-0 overflow-hidden h-full flex flex-col" data-chart={testId}>
      <h3 className="text-sm font-semibold text-gray-900 leading-5">{title}</h3>
      <p className="text-xs text-gray-400 leading-4 mt-0.5 mb-3 min-h-[16px]">{sub}</p>
      {children}
    </section>
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
    <Panel title="Cash in vs cash out" sub="Last 6 months · collections vs disbursements (petty cash included)" testId="cashflow">
      <div className="w-full" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={INIT}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barGap={3} barCategoryGap="22%">
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={Y_WIDTH} tickCount={5} tickFormatter={pesoWhole} />
            <Tooltip content={<MoneyTip extra={(r: any) => `Net ${num(r.net) < 0 ? '−' : '+'}${peso(Math.abs(num(r.net)))}`} />} cursor={{ fill: '#f3f4f6' }} />
            <Bar dataKey="Collected" name="Collected" fill={COLORS.collected} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Disbursed" name="Disbursed" fill={COLORS.disbursed} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-3" data-legend-cash>
        <span className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, background: COLORS.collected, display: 'inline-block', borderRadius: 2 }} />Collected</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, background: COLORS.disbursed, display: 'inline-block', borderRadius: 2 }} />Disbursed</span>
      </div>
      {/* the net per month (collected − disbursed): three to a row on a phone, six on a wide screen */}
      <div className="[display:grid] grid-cols-3 sm:grid-cols-6 gap-2 mt-3" data-net-row>
        {data.map(m => {
          const n = num(m.net);
          return (
            <div key={m.month} data-net={m.month} className="rounded-lg bg-gray-50 px-2 py-1.5 text-center min-w-0">
              <p className="text-[10px] leading-3 text-gray-400">{monthLabel(m.month)} net</p>
              <p className={`text-xs font-bold leading-4 tabular-nums truncate ${n < 0 ? 'text-red-600' : n > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{n > 0 ? '+' : n < 0 ? '−' : ''}{pesoWhole(Math.abs(n))}</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function AgingChart({ title, side, testId }: { title: string; side: AgingSide; testId: string }) {
  const rows = side.buckets.map((b, i) => ({ ...b, value: num(b.amount), short: ['Not due', '1–30', '31–60', '61–90', '90+'][i] }));
  return (
    <Panel title={title} sub={`${peso(side.total)} outstanding · ${side.count} open`} testId={testId}>
      <div className="w-full" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="18%">
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="short" tick={TICK} axisLine={false} tickLine={false} tickMargin={8} interval={0} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={Y_WIDTH} tickCount={5} tickFormatter={pesoWhole} />
            <Tooltip content={<MoneyTip extra={(r: any) => `${r.label} · ${r.count} item${r.count === 1 ? '' : 's'}`} />} cursor={{ fill: '#f3f4f6' }} />
            <Bar dataKey="value" name="Balance" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((r, i) => <Cell key={r.key} fill={AGING_COLORS[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] leading-4 text-gray-400 mt-auto pt-2">Days late counted from the next unmet due date; no due date counts as not yet due.</p>
    </Panel>
  );
}

export function AgingCharts({ aging }: { aging: ChartsData['aging'] }) {
  return (
    <div className="[display:grid] md:grid-cols-2 gap-4 items-stretch" data-aging>
      <AgingChart title="Receivables aging" side={aging.receivables} testId="aging-receivables" />
      <AgingChart title="Payables aging" side={aging.payables} testId="aging-payables" />
    </div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function GlSpendChart({ data }: { data: ChartsData['spendByGl'] }) {
  const rows = data.rows.map(r => ({ ...r, value: num(r.amount) }));
  const h = Math.max(120, rows.length * 36 + 32);
  return (
    <Panel title="Spending by GL account" sub={`${monthName(data.month)} · expense lines of active vouchers · ${peso(data.total)} (PO payments are not expenses)`} testId="gl-spend">
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">No expense lines this month.</p> : (
        <div className="w-full" style={{ height: h }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: h }}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid stroke={COLORS.grid} horizontal={false} />
              <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickMargin={6} tickCount={5} tickFormatter={pesoWhole} />
              <YAxis type="category" dataKey="name" width={150} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: string) => clip(String(v), 24)} />
              <Tooltip content={<MoneyTip extra={(r: any) => `${r.lines} expense line${r.lines === 1 ? '' : 's'}`} />} cursor={{ fill: '#f3f4f6' }} />
              <Bar dataKey="value" name="Spent" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {rows.map(r => <Cell key={r.key} fill={r.key === 'none' ? COLORS.noGl : COLORS.gl} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export function OverviewCharts({ charts }: { charts: ChartsData }) {
  return (
    <div className="[display:grid] gap-4" data-charts>
      <CashFlowChart data={charts.cashFlow} />
      <AgingCharts aging={charts.aging} />
      <GlSpendChart data={charts.spendByGl} />
    </div>
  );
}
