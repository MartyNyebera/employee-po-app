// Cubic (cu.m.) line items -- the server twin of src/app/lib/units.ts (keep the two in step; the
// verification script compares them on the same inputs).
//
// A cubic line has No. of loads x Cubic per load = Total cubic, and the Total cubic IS the line's
// `quantity`. Price is per cubic meter, so amount = quantity x unit price like any other line and
// receiving, inventory and spend need nothing special. loads / cubicPerLoad / loadType are stored on
// the line next to it; every other line has none of the three.

export const CUBIC_UNIT = 'cu.m.';
export const isCubicUnit = (u) => String(u ?? '').trim().toLowerCase() === CUBIC_UNIT;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pos = (v) => {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

export function cubicTotal(loads, per) {
  const l = pos(loads), c = pos(per);
  return l === null || c === null ? null : round2(l * c);
}

export function hasCubicBreakdown(it) {
  if (!it || !isCubicUnit(it.unit)) return false;
  const t = cubicTotal(it.loads, it.cubicPerLoad);
  const q = Number(it.quantity);
  return t !== null && Number.isFinite(q) && Math.abs(q - t) < 0.005;
}

export function cubicBreakdownText(it) {
  if (!hasCubicBreakdown(it)) return null;
  const l = Number(it.loads), c = Number(it.cubicPerLoad);
  const type = String(it.loadType ?? '').trim();
  return `${l} ${l === 1 ? 'load' : 'loads'} × ${c} ${CUBIC_UNIT}${type ? ` (${type})` : ''}`;
}

export const lineDescription = (it, original) => {
  const b = cubicBreakdownText(it);
  return b ? `${original}, ${b}` : original;
};

// ---- PRICE BASIS (twin of units.ts): a cubic line is priced per load ('load') or per cu.m. ('cum').
// A per-load line's amount is No. of loads x price per load, exactly; its quantity stays the Total cubic and its
// per-cu.m. unit cost is derived (amount / total cubic) for costing only. A line with no price_basis is 'cum'.
export const round6 = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const nonNeg = (v) => { const t = String(v ?? '').trim(); const n = Number(t); return t !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
export const priceBasisOf = (it) => (it && it.price_basis === 'load' ? 'load' : 'cum');
export const isLoadBasis = (it) => !!it && hasCubicBreakdown(it) && it.price_basis === 'load';
export const isPerLoad = (it) => !!it && hasCubicBreakdown(it) && it.price_basis === 'load' && nonNeg(it.price_per_load) !== null;
export function perLoadAmount(loads, ppl) {
  const l = pos(loads), p = nonNeg(ppl);
  return l === null || p === null ? null : round2(l * p);
}
export const derivedUnitCost = (amount, totalCubic) => (totalCubic > 0 ? round6(amount / totalCubic) : 0);

/**
 * A line's amount: a per-load cubic line is loads x price per load (authoritative); every other line is quantity x
 * unit cost exactly as before. `costKey` is the unit-cost field the document uses (unitCost on PR/PO).
 */
export function lineAmountOf(it, costKey = 'unitCost') {
  if (isPerLoad(it)) return perLoadAmount(it.loads, it.price_per_load);
  return (Number(it && it.quantity) || 0) * (Number(it && (it[costKey] ?? it.unitPrice)) || 0);
}

/** Per-load line: set amount (authoritative) and the derived per-cu.m. unit cost; any other line untouched. */
export function applyCubicPricing(it) {
  if (!isPerLoad(it)) return it;
  const amount = perLoadAmount(it.loads, it.price_per_load);
  const d = derivedUnitCost(amount, Number(it.quantity));
  const out = { ...it, amount, unitCost: d };
  if ('unitPrice' in it) out.unitPrice = d;
  return out;
}

/** loads, cubicPerLoad, loadType (+ price_basis / price_per_load) for a consistent cubic line, {} for anything else. */
export function cubicKeys(it) {
  if (!hasCubicBreakdown(it)) return {};
  const out = { loads: Number(it.loads), cubicPerLoad: Number(it.cubicPerLoad), loadType: String(it.loadType ?? '').trim().slice(0, 60) || null };
  if (it.price_basis === 'load' || it.price_basis === 'cum') out.price_basis = it.price_basis;
  if (isPerLoad(it)) out.price_per_load = Number(it.price_per_load);
  return out;
}

const hasAnyCubicKey = (it) => it && (it.loads != null || it.cubicPerLoad != null || it.price_basis != null || it.price_per_load != null);

/**
 * For a PR or PO whose lines the CLIENT builds: a line that carries loads / cubic-per-load must be a cu.m.
 * line whose quantity is exactly loads x cubic per load (2 decimals). Returns an error sentence or null.
 * A cu.m. line with no loads at all is allowed (a plain quantity, as before).
 */
export function cubicLineError(it, label = 'A line') {
  if (!hasAnyCubicKey(it)) return null;
  const name = String(it.description ?? '').trim() || label;
  if (!isCubicUnit(it.unit)) return `"${name}": loads and cubic per load only apply to a cu.m. line`;
  if (pos(it.loads) === null || pos(it.cubicPerLoad) === null) return `"${name}": No. of loads and Cubic per load must both be numbers greater than zero`;
  if (!hasCubicBreakdown(it)) return `"${name}": the quantity must equal No. of loads x Cubic per load (${cubicTotal(it.loads, it.cubicPerLoad).toFixed(2)})`;
  if (String(it.loadType ?? '').length > 60) return `"${name}": Load type is too long (60 characters max)`;
  if (it.price_basis != null && it.price_basis !== 'load' && it.price_basis !== 'cum') return `"${name}": price basis must be per load or per cu.m.`;
  if (it.price_basis === 'load' && nonNeg(it.price_per_load) === null) return `"${name}": a price per load is required (0 or more)`;
  return null;
}

/** Items with the three cubic keys normalised on consistent cubic lines and removed everywhere else. */
export function withCubicKeys(it) {
  const { loads, cubicPerLoad, loadType, price_basis, price_per_load, ...rest } = it || {};
  return applyCubicPricing({ ...rest, ...cubicKeys(it) });
}
