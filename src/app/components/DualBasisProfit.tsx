// ============================================================================
// DUAL-BASIS PROFIT — one panel, rendered identically for Trading Deals and for Projects.
//
// WHY THIS EXISTS. A price typed into this system is just a number, and a number alone does not say
// whether VAT is in it. Supplier and client prices arrive both ways, so "26,940" is two different
// revenues. Cost had the same split already, and worse — it was MIXED:
//   - purchase-request cost is purchase_requests.final_total, the PO's subtotal, VAT-EXCLUSIVE
//   - a logged expense is the receipt as paid, VAT-INCLUSIVE
// So the single "Profit" figure this replaces compared a VAT-inclusive price against a largely
// VAT-exclusive cost, and the difference it reported was partly just VAT. The H3 Shock Absorber
// deal is the clean example: it showed a 660.64 margin that was EXACTLY the VAT on its own
// purchase order — on a like-for-like basis the deal made nothing at all.
//
// Each entered price now carries its basis (tradings.selling_price_vat / projects.contract_price_vat)
// and the server converts every component to BOTH bases, so each column compares like with like.
//
// NO MONEY MATH HERE. Every figure — revenue, cost, profit, margin %, and the roll-up totals —
// arrives already computed from TRADING_SPEND_SQL / PROJECT_SPEND_SQL / GET /api/profit-rollup.
// This file lays them out. That invariant is why this panel can never disagree with the dashboard.
//
// A NOTE ON THE TWO MARGIN PERCENTAGES. They normally READ THE SAME, and that is correct, not a
// bug: scaling both revenue and cost by 1.12 leaves their ratio untouched. The pesos differ, the
// percentage does not. They diverge only where a basis genuinely differs — a VAT-exempt price, a
// non-vatable purchase order, or a VAT-free receipt in the mix — which is exactly when a reader
// needs to see it.
// ============================================================================

export interface BasisFigures {
  revenue: number | null;   // null = not priced yet; never 0-as-unknown
  cost: number;
  costPrs: number;
  costExpenses: number;
  profit: number | null;
  marginPercent: number | null;
}
export interface DualBasisRow {
  id: string;
  name: string;
  subtitle?: string | null;
  priceBasis?: string;      // 'inclusive' | 'exclusive' | 'exempt'
  price?: number | null;    // the number as she typed it, before conversion
  exVat: BasisFigures;
  incVat: BasisFigures;
}
export interface BasisTotals {
  total: number;
  priced: number;
  exVat: { revenue: number; cost: number; profit: number; marginPercent: number | null };
  incVat: { revenue: number; cost: number; profit: number; marginPercent: number | null };
}

const peso = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : '₱' + (Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;

const BASIS_LABEL: Record<string, string> = {
  inclusive: 'VAT-incl',
  exclusive: 'VAT-excl',
  exempt: 'VAT-exempt',
};
const BASIS_TITLE: Record<string, string> = {
  inclusive: 'Entered VAT-INCLUSIVE — the ex-VAT column divides it by 1.12',
  exclusive: 'Entered VAT-EXCLUSIVE — the inc-VAT column multiplies it by 1.12',
  exempt: 'VAT-exempt — both columns show the entered price unchanged',
};

// The money cells for one basis, so the ex and inc halves of a row cannot drift apart.
function BasisCells({ b }: { b: BasisFigures }) {
  const unpriced = b.profit === null;
  const loss = !unpriced && (b.profit as number) < 0;
  return (
    <>
      <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-900">{peso(b.revenue)}</td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700"
        title={`Purchased (requests) ${peso(b.costPrs)} · Logged expenses ${peso(b.costExpenses)}`}>
        {peso(b.cost)}
      </td>
      <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${unpriced ? 'text-gray-400' : loss ? 'text-red-600' : 'text-emerald-700'}`}>
        {unpriced ? 'set price' : peso(b.profit)}
      </td>
      <td className={`px-3 py-2.5 text-right whitespace-nowrap ${unpriced ? 'text-gray-400' : loss ? 'text-red-600' : 'text-emerald-700'}`}>
        {pct(b.marginPercent)}
      </td>
    </>
  );
}

export function DualBasisProfit({
  rows, totals, label, rollupNote,
}: {
  rows: DualBasisRow[];
  totals: BasisTotals | null;
  label: string;            // "deal" / "project" — used in the empty and roll-up wording
  rollupNote?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Profit on both VAT bases</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Each entered price carries its own basis, so both columns compare revenue against cost like
          for like. Purchase-request cost is VAT-exclusive as recorded; logged expenses are
          VAT-inclusive receipts. The percentages usually match — scaling both sides by 1.12 leaves
          the ratio alone — and differ only where a basis genuinely differs.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wide">
              <th className="px-4 py-2 text-left" rowSpan={2}>{label === 'project' ? 'Project' : 'Deal'}</th>
              <th className="px-3 py-2 text-center border-l border-gray-200" colSpan={4}>VAT-exclusive</th>
              <th className="px-3 py-2 text-center border-l border-gray-200" colSpan={4}>VAT-inclusive</th>
            </tr>
            <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2 text-right border-l border-gray-200">Revenue</th>
              <th className="px-3 py-2 text-right">Expenses</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right border-l border-gray-200">Revenue</th>
              <th className="px-3 py-2 text-right">Expenses</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                    {r.subtitle && <span>{r.subtitle}</span>}
                    {r.price != null && r.price > 0 && r.priceBasis && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600"
                        title={BASIS_TITLE[r.priceBasis]}>
                        entered {peso(r.price)} {BASIS_LABEL[r.priceBasis] ?? r.priceBasis}
                      </span>
                    )}
                  </div>
                </td>
                <td className="border-l border-gray-100 p-0" />
                <BasisCells b={r.exVat} />
                <td className="border-l border-gray-100 p-0" />
                <BasisCells b={r.incVat} />
              </tr>
            ))}
          </tbody>
          {totals && totals.priced > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-2.5 text-gray-900">
                  Total
                  <span className="ml-1.5 text-xs font-normal text-gray-500">
                    {totals.priced === totals.total
                      ? `all ${totals.total} ${label}${totals.total === 1 ? '' : 's'}`
                      : `${totals.priced} priced of ${totals.total}`}
                  </span>
                </td>
                <td className="border-l border-gray-200 p-0" />
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-900">{peso(totals.exVat.revenue)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700">{peso(totals.exVat.cost)}</td>
                <td className={`px-3 py-2.5 text-right whitespace-nowrap ${totals.exVat.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{peso(totals.exVat.profit)}</td>
                <td className={`px-3 py-2.5 text-right whitespace-nowrap ${totals.exVat.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{pct(totals.exVat.marginPercent)}</td>
                <td className="border-l border-gray-200 p-0" />
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-900">{peso(totals.incVat.revenue)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700">{peso(totals.incVat.cost)}</td>
                <td className={`px-3 py-2.5 text-right whitespace-nowrap ${totals.incVat.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{peso(totals.incVat.profit)}</td>
                <td className={`px-3 py-2.5 text-right whitespace-nowrap ${totals.incVat.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{pct(totals.incVat.marginPercent)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {/* The honest caveat, kept from the profit bars: cost accrues over a deal's life, so a healthy
          margin early on is provisional. Unpriced rows are excluded from the total rather than
          counted at zero revenue, which would report a loss made of deals nobody has priced yet. */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-500">
        Margin updates as costs are logged — it tightens until the {label} is done.
        {' '}Rows with no price set are left blank and excluded from the total.
        {rollupNote ? ' ' + rollupNote : ''}
      </div>
    </div>
  );
}
