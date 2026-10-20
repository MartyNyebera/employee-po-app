// The Billing Invoice totals block, computed from the item lines. Pure and display-side only: the
// server still stores exactly what the form submits, so every box stays editable and an edited box
// wins over the computed value (see `overrides`).
//
// Everything is rounded to 2 decimals at each step, the same way the server rounds a line amount.

export type VatTreatment = 'vatable' | 'exempt' | 'zero';
export type Withholding = 'none' | '1' | '2' | 'custom';

export type BiBox =
  | 'vatableSales' | 'vatExemptSales' | 'zeroRatedSales' | 'lessVat' | 'netOfVat'
  | 'vatAmount' | 'lessWithholding' | 'totalAmountDue';
export const BI_BOXES: BiBox[] = [
  'vatableSales', 'vatExemptSales', 'zeroRatedSales', 'lessVat', 'netOfVat', 'vatAmount', 'lessWithholding', 'totalAmountDue',
];

export interface BiTotalsInput {
  lineSum: number;            // S: sum of the line amounts
  treatment: VatTreatment;
  pricesIncludeVat: boolean;  // only meaningful for VATable
  withholding: Withholding;
  customWithholding: string;  // the amount, when withholding === 'custom'
  discount: string;           // typed, never computed
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const n2 = (v: unknown) => { const x = Number(String(v ?? '').replace(/,/g, '').trim()); return Number.isFinite(x) ? x : 0; };
const f = (n: number) => r2(n).toFixed(2);
const TOL = 0.005;

export interface BiTotals {
  computed: Record<BiBox, string>;  // what the rules produce (override-aware where a box derives from another)
  shown: Record<BiBox, string>;     // what the form displays and submits: an override, else computed
  warnings: string[];
}

export function computeBiTotals(inp: BiTotalsInput, overrides: Partial<Record<BiBox, string>> = {}): BiTotals {
  const blank = Object.fromEntries(BI_BOXES.map(k => [k, ''])) as Record<BiBox, string>;
  const S = r2(inp.lineSum);
  const hasOverride = Object.keys(overrides).length > 0;
  if (S === 0 && !hasOverride) return { computed: blank, shown: { ...blank }, warnings: [] };

  // Stage 1 -- the boxes that come straight from S.
  const c: Record<BiBox, string> = { ...blank };
  let net = S, vat = 0;
  if (inp.treatment === 'vatable') {
    if (inp.pricesIncludeVat) { net = r2(S / 1.12); vat = r2(S - net); }
    else { net = S; vat = r2(S * 0.12); }
    c.vatableSales = f(net);
  } else if (inp.treatment === 'exempt') c.vatExemptSales = f(S);
  else c.zeroRatedSales = f(S);
  c.netOfVat = f(net);
  c.lessVat = f(vat);
  const s1 = { ...c, ...overrides } as Record<BiBox, string>;

  // Stage 2 -- boxes that depend on the Net / Less VAT actually showing (so an override flows on).
  const disc = n2(inp.discount);
  const base = r2(n2(s1.netOfVat) - disc);
  c.vatAmount = inp.treatment !== 'vatable' ? '0.00' : disc > 0 ? f(base * 0.12) : f(n2(s1.lessVat));
  c.lessWithholding = inp.withholding === 'none' ? ''
    : inp.withholding === 'custom' ? (inp.customWithholding.trim() === '' ? '' : f(n2(inp.customWithholding)))
    : f(base * (inp.withholding === '1' ? 0.01 : 0.02));
  const s2 = { ...c, ...overrides } as Record<BiBox, string>;

  // Stage 3 -- the total, from the boxes as shown.
  const formulaTotal = r2(base + n2(s2.vatAmount) - n2(s2.lessWithholding));
  c.totalAmountDue = f(formulaTotal);
  const shown = { ...c, ...overrides } as Record<BiBox, string>;

  // Soft ties, never blocking. Only worth saying when something was typed over.
  const warnings: string[] = [];
  if (hasOverride) {
    const sales = n2(shown.vatableSales) + n2(shown.vatExemptSales) + n2(shown.zeroRatedSales);
    if (Math.abs(sales - n2(shown.netOfVat)) > TOL) warnings.push('The sales boxes (VATable + exempt + zero-rated) don’t add up to Net of VAT.');
    if (inp.treatment === 'vatable') {
      const gross = inp.pricesIncludeVat ? S : r2(S + r2(S * 0.12));
      if (Math.abs(n2(shown.netOfVat) + n2(shown.lessVat) - gross) > TOL) warnings.push('Net of VAT + Less: VAT doesn’t equal the total of the lines.');
    }
    if (Math.abs(n2(shown.totalAmountDue) - formulaTotal) > TOL) warnings.push('Total amount due isn’t Net − discount + Add: VAT − withholding of the boxes above.');
  }
  return { computed: c, shown, warnings };
}
