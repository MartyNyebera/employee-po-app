// ============================================================================
// Trading profit bars — ONE bar per trading deal, shared verbatim by Accounting's Trading Deals
// section and the admin dashboard. Both render this same component from the same /tradings/spend
// payload, so the two screens cannot drift apart.
//
// NO MONEY MATH HERE. profit (`margin`) and `marginPercent` arrive already computed by
// TRADING_SPEND_SQL. This file only decides how wide a bar is and what colour it is — the one
// arithmetic it does is turning a percentage into a pixel width, which is layout, not accounting.
//
// Inline styles rather than Tailwind: this renders inside the dashboard's `.admin-portal` wrapper,
// where professional-design-complete.css overrides utility classes with !important (the sibling
// ProjectBudgetChart documents the same constraint). Inline styles are immune to that, and using
// them here is what lets one component serve both hosts unchanged.
// ============================================================================

// One basis's already-computed figures, as /tradings/spend and /projects/spend now return them.
export interface ProfitBasisFigures {
  revenue: number | null;
  cost: number;
  costPrs: number;
  costExpenses: number;
  profit: number | null;
  marginPercent: number | null;
}
export interface TradingProfitRow {
  // `id` lets a project render through this same component; tradings keep tradingId. One of the two.
  id?: string;
  tradingId?: string;
  name: string;
  client?: string | null;
  status?: string;
  spent: number;
  spentPrs: number;
  spentExpenses: number;
  sellingPrice: number | null;
  // Both null until a non-zero selling price is set. Null means "unknown", never "zero" — a deal
  // with no price gets no bar rather than a bar implying a 100% loss.
  margin: number | null;
  marginPercent: number | null;
  // Present on the dual-basis payloads. When the `basis` prop names one, the bar is drawn from it
  // instead of from margin/marginPercent above, so the same component serves the single-basis
  // dashboard and the dual-basis accounting panels without either knowing about the other.
  exVat?: ProfitBasisFigures;
  incVat?: ProfitBasisFigures;
}

const peso = (v: number) =>
  '₱' + (Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Compact form for the narrow dashboard column; the full value always rides along in a title.
const fmt = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? '₱' + (a / 1e6).toFixed(2) + 'M'
    : a >= 1e3 ? '₱' + (a / 1e3).toFixed(1) + 'K'
      : '₱' + a.toFixed(0);
  return (v < 0 ? '−' : '') + s;
};
const pct = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;

const GREEN = '#059669';
const GREEN_SOFT = '#d1fae5';
const RED = '#dc2626';
const RED_SOFT = '#fee2e2';

// How much of the track to fill. Profit is shown as a share of the selling price, which is what
// margin % already is — so a 92% margin fills 92% of the track and reads the same as its label.
// A loss fills by the same measure and is capped at the full track, so a catastrophic overrun looks
// pinned rather than overflowing its container.
const fillPct = (marginPercent: number) => Math.min(100, Math.max(2, Math.abs(marginPercent)));

// Which numbers a row contributes. Without `basis` this is the original single-basis reading, so
// the admin dashboard renders exactly as before. With it, the named basis block is used.
const readRow = (r: TradingProfitRow, basis?: 'exVat' | 'incVat') => {
  const b = basis ? r[basis] : undefined;
  return b
    ? { profit: b.profit, marginPercent: b.marginPercent, cost: b.cost, price: b.revenue, prs: b.costPrs, expenses: b.costExpenses }
    : { profit: r.margin, marginPercent: r.marginPercent, cost: r.spent, price: r.sellingPrice, prs: r.spentPrs, expenses: r.spentExpenses };
};

export function TradingProfitBars({ rows, compact = false, basis, title }: {
  rows: TradingProfitRow[];
  compact?: boolean;
  basis?: 'exVat' | 'incVat';
  title?: string;
}) {
  if (rows.length === 0) return null;
  const priced = rows.filter(r => readRow(r, basis).profit !== null);
  // Summing values the server already computed, which is display aggregation, not money math.
  const totalProfit = priced.reduce((t, r) => t + (readRow(r, basis).profit as number), 0);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px',
        padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
          {title ?? 'Trading profit'}
          {basis && (
            <span style={{ fontWeight: 600, color: '#64748b' }}>
              {basis === 'exVat' ? ' — VAT-exclusive' : ' — VAT-inclusive'}
            </span>
          )}
        </span>
        {priced.length > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: totalProfit < 0 ? RED : GREEN }} title={peso(totalProfit)}>
            {priced.length === rows.length ? 'Total' : `${priced.length} priced`} {fmt(totalProfit)}
          </span>
        )}
      </div>

      <div>
        {rows.map(r => {
          const v = readRow(r, basis);
          const unpriced = v.profit === null || v.marginPercent === null;
          const loss = !unpriced && (v.profit as number) < 0;
          const width = unpriced ? 0 : fillPct(v.marginPercent as number);
          return (
            <div key={r.id ?? r.tradingId} style={{ padding: compact ? '8px 12px' : '10px 12px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{
                  fontSize: '12px', color: '#0f172a', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={r.client ? `${r.name} — ${r.client}` : r.name}>{r.name}</span>
                {unpriced ? (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>set selling price</span>
                ) : (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: loss ? RED : GREEN, whiteSpace: 'nowrap' }}
                    title={`${loss ? 'Loss' : 'Profit'} ${peso(Math.abs(v.profit as number))}`}>
                    {fmt(v.profit as number)} <span style={{ fontWeight: 600, opacity: 0.85 }}>{pct(v.marginPercent as number)}</span>
                  </span>
                )}
              </div>

              {/* The bar. An unpriced deal gets a dashed EMPTY track, never a filled one — the
                  absence has to look like an absence, not like a result. */}
              <div style={{
                marginTop: '5px', height: compact ? '8px' : '10px', borderRadius: '999px',
                background: unpriced ? 'transparent' : loss ? RED_SOFT : GREEN_SOFT,
                border: unpriced ? '1px dashed #cbd5e1' : '1px solid transparent',
                overflow: 'hidden',
              }}>
                {!unpriced && (
                  <div style={{
                    width: `${width}%`, height: '100%', borderRadius: '999px',
                    background: loss ? RED : GREEN,
                  }} />
                )}
              </div>

              <div style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8' }}
                title={`Purchased ${peso(v.prs)} · Expenses ${peso(v.expenses)}`}>
                Cost {fmt(v.cost)}
                {v.price != null && v.price > 0 ? ` · Revenue ${fmt(v.price)}` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* The honest caveat. Cost accumulates over a deal's life, so a healthy-looking margin early on
          is provisional — it can only tighten as more expenses land against the same selling price. */}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
        fontSize: '10px', color: '#64748b',
      }} title="Each purchase request and each expense allocation charged to a deal raises its cost, which lowers this margin. It is final only once the deal is done and every cost is in.">
        Margin updates as costs are logged — it tightens until the deal is done.
      </div>
    </div>
  );
}
