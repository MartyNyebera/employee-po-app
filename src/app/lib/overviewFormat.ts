// Formatting shared by the Accounting Overview's pieces (cards, alerts, calendar, charts). Display only:
// every figure arrives from GET /api/accounting/overview already computed.

export const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
export const peso = (v: unknown) => `₱${num(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A peso amount with no centavos, for chart axes and tight labels. */
export const pesoShort = (v: unknown) => {
  const n = num(v), a = Math.abs(n);
  const body = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(a));
  return `${n < 0 ? '−' : ''}₱${body}`;
};
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return `${MONTHS[m - 1]} ${d}${y !== new Date().getFullYear() ? `, ${y}` : ''}`; };
/** Whole pesos with thousands separators (₱18,500), for chart axes and tight labels where centavos are noise. */
export const pesoWhole = (v: unknown) => {
  const n = Math.round(num(v));
  return `${n < 0 ? '−' : ''}₱${Math.abs(n).toLocaleString('en-PH')}`;
};
